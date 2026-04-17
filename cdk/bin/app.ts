#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/stacks/infrastructure-stack';

const app = new cdk.App();

// Get stage from context or default to dev
const stage = (app.node.tryGetContext('stage') || 'dev') as 'dev' | 'staging' | 'prod';
const account = app.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || 'us-east-1';

const env = {
  account,
  region,
};

// Consolidated Infrastructure Stack (VPC, Aurora, Redis, RDS Proxy)
new InfrastructureStack(app, `GeoServices-Infrastructure-${stage}`, {
  env,
  stage,
  description: `Core infrastructure for DOI GeoServices Platform (${stage})`,
});

// TODO: Add application stacks in future epics
// - Epic 3: ECS API Service stack
// - Epic 4: ECS Tile Server stack
// - Epic 5: Lambda Import Service stack
// - Epic 6: Lambda Admin Service stack
// - Epic 7: Monitoring stack

// Global tags
cdk.Tags.of(app).add('Project', 'DOI-GeoServices');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('Repository', 'doi-geoplatform-services');

app.synth();
