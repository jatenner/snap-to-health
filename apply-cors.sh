#!/bin/bash

# apply-cors.sh - Apply CORS configuration to Firebase Storage bucket
# Usage: ./apply-cors.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BUCKET_NAME="snaphealth-39b14.appspot.com"
CORS_CONFIG_FILE="firebase/cors.json"

echo -e "${BLUE}Firebase Storage CORS Configuration Utility${NC}"
echo "=============================================="

# Check if gsutil is installed
if ! command -v gsutil &> /dev/null; then
    echo -e "${RED}Error: gsutil command not found.${NC}"
    echo "Please install the Google Cloud SDK by following these instructions:"
    echo -e "${YELLOW}1. Download from: https://cloud.google.com/sdk/docs/install-sdk${NC}"
    echo -e "${YELLOW}2. Run 'gcloud init' and 'gcloud auth login' after installation${NC}"
    exit 1
fi

# Check if cors.json file exists
if [ ! -f "${CORS_CONFIG_FILE}" ]; then
    echo -e "${RED}Error: CORS configuration file '${CORS_CONFIG_FILE}' not found.${NC}"
    exit 1
fi

echo -e "${BLUE}Setting CORS configuration for bucket: ${BUCKET_NAME}${NC}"
echo -e "${YELLOW}Using configuration from: ${CORS_CONFIG_FILE}${NC}"

# Display the configuration file
echo "CORS Configuration:"
cat "${CORS_CONFIG_FILE}"

# Apply CORS configuration
echo -e "\n${BLUE}Applying CORS configuration...${NC}"
if gsutil cors set "${CORS_CONFIG_FILE}" "gs://${BUCKET_NAME}" ; then
    echo -e "${GREEN}✓ CORS configuration applied successfully!${NC}"
else
    echo -e "${RED}✗ Failed to apply CORS configuration. See error above.${NC}"
    exit 1
fi

# Verify the configuration
echo -e "\n${BLUE}Verifying CORS configuration...${NC}"
if gsutil cors get "gs://${BUCKET_NAME}" ; then
    echo -e "${GREEN}✓ CORS configuration verified successfully!${NC}"
    echo -e "${GREEN}✓ Your application should now work on both localhost:3000 and localhost:3009${NC}"
else
    echo -e "${RED}✗ Failed to verify CORS configuration. See error above.${NC}"
    exit 1
fi

echo -e "\n${GREEN}CORS configuration has been successfully applied to ${BUCKET_NAME}${NC}"
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Start your application with 'npm run dev:3009'"
echo "2. Test uploads to ensure CORS is working correctly"
echo "3. If you encounter issues, check the browser developer console for CORS errors"

exit 0 