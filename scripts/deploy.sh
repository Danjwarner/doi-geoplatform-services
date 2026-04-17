#!/bin/bash

# DOI GeoServices Platform - Deployment Script
# Usage: ./scripts/deploy.sh [stage] [command]
# Example: ./scripts/deploy.sh dev deploy

set -e  # Exit on error

STAGE=${1:-dev}
COMMAND=${2:-deploy}

echo "======================================"
echo "DOI GeoServices Platform Deployment"
echo "Stage: $STAGE"
echo "Command: $COMMAND"
echo "======================================"

# Validate stage
if [[ ! "$STAGE" =~ ^(dev|staging|prod)$ ]]; then
  echo "Error: Invalid stage '$STAGE'. Must be: dev, staging, or prod"
  exit 1
fi

# Change to CDK directory
cd "$(dirname "$0")/../cdk"

case "$COMMAND" in
  synth)
    echo "Synthesizing CloudFormation template..."
    npx cdk synth --context stage=$STAGE
    ;;

  diff)
    echo "Showing changes..."
    npx cdk diff --context stage=$STAGE
    ;;

  deploy)
    echo "Deploying infrastructure..."
    echo ""
    echo "WARNING: This will create AWS resources that incur costs:"
    if [ "$STAGE" = "dev" ]; then
      echo "  - Estimated cost: ~\$150/month"
    elif [ "$STAGE" = "staging" ]; then
      echo "  - Estimated cost: ~\$600/month"
    else
      echo "  - Estimated cost: ~\$950/month (at 10M req/day)"
    fi
    echo ""
    read -p "Continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
      echo "Deployment cancelled"
      exit 0
    fi

    npx cdk deploy --context stage=$STAGE --require-approval never

    echo ""
    echo "======================================"
    echo "Deployment Complete!"
    echo "======================================"
    echo ""
    echo "Next steps:"
    echo "1. Install PostGIS extension:"
    echo "   aws secretsmanager get-secret-value --secret-id geoservices-db-$STAGE --query SecretString --output text | jq -r .password"
    echo "   psql -h <ClusterEndpoint> -U postgres -d geoservices -c \"CREATE EXTENSION postgis;\""
    echo ""
    echo "2. View outputs:"
    echo "   npx cdk outputs --context stage=$STAGE"
    echo ""
    echo "3. Test connectivity:"
    echo "   psql -h <ClusterEndpoint> -U postgres -d geoservices -c \"SELECT PostGIS_version();\""
    ;;

  destroy)
    echo "Destroying infrastructure..."
    echo ""
    echo "WARNING: This will DELETE all resources in the $STAGE environment!"
    echo "This action CANNOT be undone."
    echo ""
    read -p "Type 'destroy-$STAGE' to confirm: " confirm
    if [ "$confirm" != "destroy-$STAGE" ]; then
      echo "Destroy cancelled"
      exit 0
    fi

    npx cdk destroy --context stage=$STAGE --force
    echo "Infrastructure destroyed"
    ;;

  outputs)
    echo "Fetching stack outputs..."
    aws cloudformation describe-stacks \
      --stack-name "GeoServices-Infrastructure-$STAGE" \
      --query 'Stacks[0].Outputs' \
      --output table
    ;;

  *)
    echo "Error: Unknown command '$COMMAND'"
    echo ""
    echo "Available commands:"
    echo "  synth   - Synthesize CloudFormation template"
    echo "  diff    - Show what will change"
    echo "  deploy  - Deploy infrastructure"
    echo "  destroy - Destroy infrastructure"
    echo "  outputs - Show stack outputs"
    exit 1
    ;;
esac
