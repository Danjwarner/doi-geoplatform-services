import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface InfrastructureStackProps extends cdk.StackProps {
  readonly stage: 'dev' | 'staging' | 'prod';
}

/**
 * Consolidated infrastructure stack for DOI GeoServices Platform
 *
 * Creates all foundational infrastructure in a single stack:
 * - VPC with public/private/isolated subnets
 * - Security groups
 * - Aurora Serverless v2 PostgreSQL + PostGIS
 * - ElastiCache Redis cluster
 * - RDS Proxy for Lambda
 * - Secrets Manager for credentials
 */
export class InfrastructureStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly cluster: rds.DatabaseCluster;
  public readonly proxy: rds.DatabaseProxy;
  public readonly redisCluster: elasticache.CfnReplicationGroup;

  constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
    super(scope, id, props);

    // ========================================
    // SECTION 1: NETWORKING
    // ========================================

    // VPC with 3 AZs, public + private subnets
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `geoservices-${props.stage}`,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 3,
      natGateways: props.stage === 'prod' ? 3 : 1, // HA for prod, cost-optimize for dev
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // VPC Flow Logs
    new ec2.FlowLog(this, 'VpcFlowLog', {
      resourceType: ec2.FlowLogResourceType.fromVpc(this.vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    // Security Groups
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for ECS Fargate tasks',
      allowAllOutbound: true,
    });

    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: true,
    });

    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Aurora PostgreSQL',
      allowAllOutbound: false,
    });

    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for ElastiCache Redis',
      allowAllOutbound: false,
    });

    // Security group rules
    databaseSecurityGroup.addIngressRule(
      ecsSecurityGroup,
      ec2.Port.tcp(5432),
      'ECS to PostgreSQL'
    );
    databaseSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Lambda to PostgreSQL'
    );

    redisSecurityGroup.addIngressRule(
      ecsSecurityGroup,
      ec2.Port.tcp(6379),
      'ECS to Redis'
    );
    redisSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(6379),
      'Lambda to Redis'
    );

    // ========================================
    // SECTION 2: DATABASE (Aurora + PostGIS)
    // ========================================

    // Database credentials in Secrets Manager
    const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      secretName: `geoservices-db-${props.stage}`,
      description: 'Aurora PostgreSQL credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
      },
    });

    // Aurora Serverless v2 Cluster
    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      clusterIdentifier: `geoservices-${props.stage}`,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_5,
      }),
      credentials: rds.Credentials.fromSecret(dbSecret),
      defaultDatabaseName: 'geoservices',

      writer: rds.ClusterInstance.serverlessV2('writer', {
        autoMinorVersionUpgrade: true,
        publiclyAccessible: false,
        enablePerformanceInsights: props.stage === 'prod',
        performanceInsightRetention: props.stage === 'prod'
          ? rds.PerformanceInsightRetention.LONG_TERM
          : undefined,
      }),

      readers: [
        rds.ClusterInstance.serverlessV2('reader1', {
          autoMinorVersionUpgrade: true,
          publiclyAccessible: false,
          scaleWithWriter: true,
        }),
      ],

      serverlessV2MinCapacity: props.stage === 'dev' ? 0.5 : 1,
      serverlessV2MaxCapacity: props.stage === 'dev' ? 2 : 16,

      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [databaseSecurityGroup],

      backup: {
        retention: props.stage === 'prod' ? cdk.Duration.days(35) : cdk.Duration.days(7),
        preferredWindow: '03:00-04:00',
      },
      preferredMaintenanceWindow: 'sun:04:00-sun:05:00',

      monitoringInterval: props.stage === 'prod' ? cdk.Duration.seconds(60) : cdk.Duration.seconds(0),

      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: props.stage === 'prod'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,

      deletionProtection: props.stage === 'prod',
      storageEncrypted: true,

      parameterGroup: new rds.ParameterGroup(this, 'DbParamGroup', {
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_15_5,
        }),
        description: 'Optimized for PostGIS workloads',
        parameters: {
          shared_preload_libraries: 'pg_stat_statements,postgis',
          max_connections: '1000',
          random_page_cost: '1.1',
          effective_cache_size: '10GB',
          work_mem: '64MB',
          maintenance_work_mem: '2GB',
          log_min_duration_statement: props.stage === 'prod' ? '1000' : '500',
          log_connections: '1',
          log_disconnections: '1',
        },
      }),
    });

    // RDS Proxy for Lambda
    this.proxy = new rds.DatabaseProxy(this, 'RdsProxy', {
      proxyTarget: rds.ProxyTarget.fromCluster(this.cluster),
      secrets: [dbSecret],
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [databaseSecurityGroup],
      dbProxyName: `geoservices-proxy-${props.stage}`,
      maxConnectionsPercent: 90,
      maxIdleConnectionsPercent: 50,
      debugLogging: props.stage !== 'prod',
      requireTLS: true,
    });

    // CloudWatch Alarms for Production
    if (props.stage === 'prod') {
      this.cluster.metricDatabaseConnections().createAlarm(this, 'HighConnectionsAlarm', {
        threshold: 800,
        evaluationPeriods: 2,
        alarmDescription: 'Aurora connections > 800',
        alarmName: `${props.stage}-geoservices-high-db-connections`,
      });

      this.cluster.metricCPUUtilization().createAlarm(this, 'HighCpuAlarm', {
        threshold: 80,
        evaluationPeriods: 3,
        alarmDescription: 'Aurora CPU > 80%',
        alarmName: `${props.stage}-geoservices-high-db-cpu`,
      });

      this.cluster.metricACUUtilization().createAlarm(this, 'HighAcuAlarm', {
        threshold: 90,
        evaluationPeriods: 2,
        alarmDescription: 'Aurora ACU > 90%',
        alarmName: `${props.stage}-geoservices-high-acu`,
      });
    }

    // ========================================
    // SECTION 3: CACHE (ElastiCache Redis)
    // ========================================

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Redis',
      subnetIds: this.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      }).subnetIds,
      cacheSubnetGroupName: `geoservices-redis-${props.stage}`,
    });

    const redisParamGroup = new elasticache.CfnParameterGroup(this, 'RedisParamGroup', {
      cacheParameterGroupFamily: 'redis7',
      description: 'Optimized for geospatial caching',
      properties: {
        'maxmemory-policy': 'allkeys-lru',
        timeout: '300',
        'tcp-keepalive': '60',
        'lazyfree-lazy-eviction': 'yes',
        'lazyfree-lazy-expire': 'yes',
        save: '',
        'slowlog-log-slower-than': '10000',
        'slowlog-max-len': '128',
      },
    });

    const nodeType = this.getRedisNodeType(props.stage);
    const numCacheClusters = props.stage === 'prod' ? 2 : 1;

    this.redisCluster = new elasticache.CfnReplicationGroup(this, 'RedisCluster', {
      replicationGroupId: `geoservices-${props.stage}`,
      replicationGroupDescription: `Redis for GeoServices ${props.stage}`,
      engine: 'redis',
      engineVersion: '7.1',
      cacheNodeType: nodeType,
      numCacheClusters,
      multiAzEnabled: props.stage === 'prod',
      automaticFailoverEnabled: props.stage === 'prod',
      cacheSubnetGroupName: redisSubnetGroup.cacheSubnetGroupName,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
      cacheParameterGroupName: redisParamGroup.ref,
      snapshotRetentionLimit: props.stage === 'prod' ? 7 : 1,
      snapshotWindow: '03:00-05:00',
      preferredMaintenanceWindow: 'sun:05:00-sun:07:00',
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: false, // TODO: Enable in Epic 2 with auth token
      logDeliveryConfigurations: [
        {
          destinationType: 'cloudwatch-logs',
          destinationDetails: {
            cloudWatchLogsDetails: {
              logGroup: new logs.LogGroup(this, 'RedisSlowLog', {
                logGroupName: `/aws/elasticache/geoservices-${props.stage}/slow-log`,
                retention: props.stage === 'prod'
                  ? logs.RetentionDays.ONE_MONTH
                  : logs.RetentionDays.ONE_WEEK,
              }).logGroupName,
            },
          },
          logFormat: 'json',
          logType: 'slow-log',
        },
      ],
      autoMinorVersionUpgrade: true,
      tags: [
        { key: 'Project', value: 'DOI-GeoServices' },
        { key: 'Stage', value: props.stage },
        { key: 'Component', value: 'Cache' },
      ],
    });

    this.redisCluster.addDependency(redisSubnetGroup);

    // ========================================
    // OUTPUTS
    // ========================================

    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
    });

    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint.hostname,
      description: 'Aurora writer endpoint',
    });

    new cdk.CfnOutput(this, 'ClusterReadEndpoint', {
      value: this.cluster.clusterReadEndpoint.hostname,
      description: 'Aurora reader endpoint (for tiles)',
    });

    new cdk.CfnOutput(this, 'ProxyEndpoint', {
      value: this.proxy.endpoint,
      description: 'RDS Proxy endpoint (for Lambda)',
    });

    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: dbSecret.secretArn,
      description: 'Database credentials ARN',
    });

    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: this.redisCluster.attrPrimaryEndPointAddress,
      description: 'Redis primary endpoint',
    });

    new cdk.CfnOutput(this, 'RedisPort', {
      value: this.redisCluster.attrPrimaryEndPointPort,
      description: 'Redis port',
    });

    new cdk.CfnOutput(this, 'EcsSecurityGroupId', {
      value: ecsSecurityGroup.securityGroupId,
      description: 'ECS security group ID (for Epic 3)',
    });

    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: lambdaSecurityGroup.securityGroupId,
      description: 'Lambda security group ID (for Epic 5)',
    });

    // Manual PostGIS installation note
    new cdk.CfnOutput(this, 'PostGISInstallation', {
      value: 'MANUAL',
      description: 'Run: psql -h <endpoint> -U postgres -d geoservices -c "CREATE EXTENSION postgis;"',
    });

    // Tags
    cdk.Tags.of(this).add('Project', 'DOI-GeoServices');
    cdk.Tags.of(this).add('Stage', props.stage);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }

  private getRedisNodeType(stage: string): string {
    switch (stage) {
      case 'dev':
        return 'cache.t4g.micro'; // ~$12/month
      case 'staging':
        return 'cache.r7g.large'; // ~$180/month
      case 'prod':
        return 'cache.r7g.large'; // ~$180/month × 2
      default:
        return 'cache.t4g.small';
    }
  }
}
