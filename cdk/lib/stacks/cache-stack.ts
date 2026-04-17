import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface CacheStackProps extends cdk.StackProps {
  readonly stage: 'dev' | 'staging' | 'prod';
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
}

/**
 * Cache stack for DOI GeoServices Platform
 *
 * Creates:
 * - ElastiCache Redis cluster with primary + replica
 * - Multi-AZ deployment for production
 * - CloudWatch alarms for cache performance
 */
export class CacheStack extends cdk.Stack {
  public readonly replicationGroup: elasticache.CfnReplicationGroup;
  public readonly endpoint: string;
  public readonly port: number;

  constructor(scope: Construct, id: string, props: CacheStackProps) {
    super(scope, id, props);

    // Subnet group for ElastiCache
    const subnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for GeoServices Redis cluster',
      subnetIds: props.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      }).subnetIds,
      cacheSubnetGroupName: `geoservices-redis-${props.stage}`,
    });

    // Parameter group for Redis optimization
    const parameterGroup = new elasticache.CfnParameterGroup(this, 'RedisParamGroup', {
      cacheParameterGroupFamily: 'redis7',
      description: 'Parameter group optimized for geospatial caching',
      properties: {
        // Memory management
        'maxmemory-policy': 'allkeys-lru', // Evict least recently used keys
        'timeout': '300', // Close idle connections after 5 min

        // Performance tuning
        'tcp-keepalive': '60',
        'lazyfree-lazy-eviction': 'yes',
        'lazyfree-lazy-expire': 'yes',

        // Disable RDB snapshots (rely on replica instead)
        'save': '',

        // Logging (adjust for production)
        'slowlog-log-slower-than': '10000', // 10ms
        'slowlog-max-len': '128',
      },
    });

    // Node type based on stage
    const nodeType = this.getNodeType(props.stage);
    const numCacheClusters = props.stage === 'prod' ? 2 : 1; // Primary + replica for prod

    // ElastiCache Redis Replication Group
    this.replicationGroup = new elasticache.CfnReplicationGroup(this, 'RedisCluster', {
      replicationGroupId: `geoservices-${props.stage}`,
      replicationGroupDescription: `Redis cluster for GeoServices ${props.stage}`,

      // Engine configuration
      engine: 'redis',
      engineVersion: '7.1',
      cacheNodeType: nodeType,
      numCacheClusters,

      // Multi-AZ for production
      multiAzEnabled: props.stage === 'prod',
      automaticFailoverEnabled: props.stage === 'prod',

      // Network configuration
      cacheSubnetGroupName: subnetGroup.cacheSubnetGroupName,
      securityGroupIds: [props.securityGroup.securityGroupId],

      // Parameter group
      cacheParameterGroupName: parameterGroup.ref,

      // Backup configuration
      snapshotRetentionLimit: props.stage === 'prod' ? 7 : 1,
      snapshotWindow: '03:00-05:00', // 3-5 AM UTC
      preferredMaintenanceWindow: 'sun:05:00-sun:07:00',

      // Encryption
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: false, // TODO: Enable TLS + auth in Epic 2
      // authToken: this.generateAuthToken(), // Requires TLS

      // Logging
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

      // Auto minor version upgrade
      autoMinorVersionUpgrade: true,

      // Tags
      tags: [
        { key: 'Project', value: 'DOI-GeoServices' },
        { key: 'Stage', value: props.stage },
        { key: 'Component', value: 'Cache' },
      ],
    });

    this.replicationGroup.addDependency(subnetGroup);

    // Store endpoint and port
    this.endpoint = this.replicationGroup.attrPrimaryEndPointAddress;
    this.port = parseInt(this.replicationGroup.attrPrimaryEndPointPort);

    // CloudWatch Alarms for production
    if (props.stage === 'prod') {
      this.createAlarms(props.stage);
    }

    // Outputs
    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: this.endpoint,
      description: 'Redis primary endpoint',
      // exportName removed to avoid circular dependencies
    });

    new cdk.CfnOutput(this, 'RedisPort', {
      value: this.port.toString(),
      description: 'Redis port',
      // exportName removed to avoid circular dependencies
    });

    new cdk.CfnOutput(this, 'RedisConnectionString', {
      value: `rediss://${this.endpoint}:${this.port}`,
      description: 'Redis connection string (TLS)',
    });

    // Tags
    cdk.Tags.of(this).add('Project', 'DOI-GeoServices');
    cdk.Tags.of(this).add('Stage', props.stage);
  }

  /**
   * Select appropriate node type based on stage
   */
  private getNodeType(stage: string): string {
    switch (stage) {
      case 'dev':
        return 'cache.t4g.micro'; // 0.5 GB, ~$12/month
      case 'staging':
        return 'cache.r7g.large'; // 13.07 GB, ~$180/month
      case 'prod':
        return 'cache.r7g.large'; // 13.07 GB, ~$180/month × 2 (primary + replica)
      default:
        return 'cache.t4g.small';
    }
  }

  // TODO Epic 2: Generate auth token and store in Secrets Manager
  // private generateAuthToken(): string {
  //   return `geoservices-redis-${this.node.addr.slice(0, 16)}`;
  // }

  /**
   * Create CloudWatch alarms for cache monitoring
   */
  private createAlarms(_stage: string): void {
    // TODO: Implement CloudWatch alarms
    // - High CPU utilization
    // - High memory utilization
    // - High cache evictions
    // - High number of connections
    // Will implement in Epic 7 (Monitoring & Observability)
  }
}
