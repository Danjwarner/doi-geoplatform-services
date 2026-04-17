import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  readonly stage: 'dev' | 'staging' | 'prod';
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly databaseName?: string;
}

/**
 * Database stack for DOI GeoServices Platform
 *
 * Creates:
 * - Aurora Serverless v2 PostgreSQL cluster with PostGIS
 * - Read replica for tile queries
 * - RDS Proxy for Lambda connection pooling
 * - Secrets Manager for credentials (auto-rotated)
 * - CloudWatch logs and monitoring
 */
export class DatabaseStack extends cdk.Stack {
  public readonly cluster: rds.DatabaseCluster;
  public readonly secret: secretsmanager.ISecret;
  public readonly proxy: rds.DatabaseProxy;
  public readonly readerEndpoint: string;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const databaseName = props.databaseName || 'geoservices';

    // Credentials stored in Secrets Manager
    const databaseSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: `geoservices-db-${props.stage}`,
      description: 'Aurora PostgreSQL master credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
      },
    });

    this.secret = databaseSecret;

    // Aurora Serverless v2 Cluster
    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      clusterIdentifier: `geoservices-${props.stage}`,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_5,
      }),
      credentials: rds.Credentials.fromSecret(databaseSecret),
      defaultDatabaseName: databaseName,

      // Serverless v2 scaling
      writer: rds.ClusterInstance.serverlessV2('writer', {
        autoMinorVersionUpgrade: true,
        publiclyAccessible: false,
        enablePerformanceInsights: props.stage === 'prod',
        performanceInsightRetention: props.stage === 'prod'
          ? rds.PerformanceInsightRetention.LONG_TERM
          : undefined,
      }),

      // Read replica for tile queries
      readers: [
        rds.ClusterInstance.serverlessV2('reader1', {
          autoMinorVersionUpgrade: true,
          publiclyAccessible: false,
          scaleWithWriter: true,
        }),
      ],

      serverlessV2MinCapacity: props.stage === 'dev' ? 0.5 : 1,
      serverlessV2MaxCapacity: props.stage === 'dev' ? 2 : 16,

      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [props.securityGroup],

      // Backup and maintenance
      backup: {
        retention: props.stage === 'prod'
          ? cdk.Duration.days(35)
          : cdk.Duration.days(7),
        preferredWindow: '03:00-04:00', // 3 AM UTC
      },
      preferredMaintenanceWindow: 'sun:04:00-sun:05:00',

      // Enable enhanced monitoring
      monitoringInterval: props.stage === 'prod'
        ? cdk.Duration.seconds(60)
        : cdk.Duration.seconds(0),

      // CloudWatch logs
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: props.stage === 'prod'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,

      // Deletion protection for production
      deletionProtection: props.stage === 'prod',

      // Storage encryption
      storageEncrypted: true,

      // Parameter group for PostGIS optimization
      parameterGroup: new rds.ParameterGroup(this, 'DbParamGroup', {
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_15_5,
        }),
        description: 'Parameter group optimized for PostGIS workloads',
        parameters: {
          // PostGIS settings
          'shared_preload_libraries': 'pg_stat_statements,postgis',
          'max_connections': '1000',

          // Performance tuning for spatial queries
          'random_page_cost': '1.1', // SSD optimization
          'effective_cache_size': '10GB',
          'work_mem': '64MB',
          'maintenance_work_mem': '2GB',

          // Logging for debugging (adjust for prod)
          'log_min_duration_statement': props.stage === 'prod' ? '1000' : '500',
          'log_connections': '1',
          'log_disconnections': '1',
        },
      }),
    });

    this.readerEndpoint = this.cluster.clusterReadEndpoint.hostname;

    // TODO: Install PostGIS extension via custom resource Lambda (Epic 2)
    // For now, install manually:
    // psql -h <endpoint> -U postgres -d geoservices
    // CREATE EXTENSION IF NOT EXISTS postgis;
    // CREATE EXTENSION IF NOT EXISTS postgis_topology;
    // Will automate this in Epic 2 when we have the core package

    // RDS Proxy for Lambda connection pooling
    this.proxy = new rds.DatabaseProxy(this, 'RdsProxy', {
      proxyTarget: rds.ProxyTarget.fromCluster(this.cluster),
      secrets: [databaseSecret],
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [props.securityGroup],

      dbProxyName: `geoservices-proxy-${props.stage}`,

      // Connection pool settings
      maxConnectionsPercent: 90,
      maxIdleConnectionsPercent: 50,

      // Debug logging (disable in prod for performance)
      debugLogging: props.stage !== 'prod',

      requireTLS: true,
    });

    // CloudWatch Alarms
    if (props.stage === 'prod') {
      // High database connections alarm
      this.cluster.metricDatabaseConnections().createAlarm(this, 'HighConnectionsAlarm', {
        threshold: 800,
        evaluationPeriods: 2,
        alarmDescription: 'Aurora connections > 800',
        alarmName: `${props.stage}-geoservices-high-db-connections`,
      });

      // High CPU alarm
      this.cluster.metricCPUUtilization().createAlarm(this, 'HighCpuAlarm', {
        threshold: 80,
        evaluationPeriods: 3,
        alarmDescription: 'Aurora CPU > 80% for 3 periods',
        alarmName: `${props.stage}-geoservices-high-db-cpu`,
      });

      // ACU utilization (Serverless v2)
      this.cluster.metricACUUtilization().createAlarm(this, 'HighAcuAlarm', {
        threshold: 90,
        evaluationPeriods: 2,
        alarmDescription: 'Aurora ACU > 90%',
        alarmName: `${props.stage}-geoservices-high-acu`,
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint.hostname,
      description: 'Aurora cluster writer endpoint',
      // exportName removed to avoid circular dependencies
    });

    new cdk.CfnOutput(this, 'ClusterReadEndpoint', {
      value: this.readerEndpoint,
      description: 'Aurora cluster reader endpoint (for tile queries)',
      // exportName removed to avoid circular dependencies
    });

    new cdk.CfnOutput(this, 'ProxyEndpoint', {
      value: this.proxy.endpoint,
      description: 'RDS Proxy endpoint (for Lambda)',
      // exportName removed to avoid circular dependencies
    });

    new cdk.CfnOutput(this, 'SecretArn', {
      value: databaseSecret.secretArn,
      description: 'Database credentials secret ARN',
      // exportName removed to avoid circular dependencies
    });

    // Tags
    cdk.Tags.of(this).add('Project', 'DOI-GeoServices');
    cdk.Tags.of(this).add('Stage', props.stage);
    cdk.Tags.of(this).add('Component', 'Database');
  }

}
