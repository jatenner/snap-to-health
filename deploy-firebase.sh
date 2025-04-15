#!/bin/bash

# Firebase Deployment Script for Snap-to-Health
# This script deploys Firebase Firestore and Storage rules

set -e # Exit on any errors

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "\n${YELLOW}========== Firebase Deployment Script ==========${NC}"
echo -e "${YELLOW}Project: Snap-to-Health${NC}"
echo -e "${YELLOW}Date: $(date)${NC}\n"

# Check if Firebase CLI is installed
if ! [ -x "$(command -v firebase)" ]; then
  echo -e "${RED}Error: Firebase CLI is not installed.${NC}" >&2
  echo -e "Please install Firebase CLI using npm:\n${YELLOW}npm install -g firebase-tools${NC}"
  exit 1
fi

# Check if logged in to Firebase
echo -e "${YELLOW}Checking Firebase login status...${NC}"
FIREBASE_AUTH=$(firebase auth:export --json 2>&1 || echo "NOT_LOGGED_IN")
if [[ $FIREBASE_AUTH == *"NOT_LOGGED_IN"* ]] || [[ $FIREBASE_AUTH == *"Error:"* ]]; then
  echo -e "${YELLOW}Please login to Firebase:${NC}"
  firebase login
else
  echo -e "${GREEN}Already logged in to Firebase.${NC}"
fi

# Check for environment variables
echo -e "\n${YELLOW}Checking environment variables...${NC}"
if [ -f .env.local ]; then
  echo -e "${GREEN}Found .env.local file.${NC}"
  
  # Check for required Firebase configuration
  REQUIRED_VARS=(
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
    "NEXT_PUBLIC_FIREBASE_API_KEY"
    "FIREBASE_CLIENT_EMAIL"
    "FIREBASE_PRIVATE_KEY"
  )
  
  MISSING_VARS=()
  
  for VAR in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^$VAR=" .env.local; then
      MISSING_VARS+=("$VAR")
    fi
  done
  
  if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}Missing required environment variables in .env.local:${NC}"
    for VAR in "${MISSING_VARS[@]}"; do
      echo -e "  - $VAR"
    done
    exit 1
  else
    echo -e "${GREEN}All required environment variables found.${NC}"
  fi
  
  # Extract project ID
  PROJECT_ID=$(grep "^NEXT_PUBLIC_FIREBASE_PROJECT_ID=" .env.local | cut -d '=' -f2)
  echo -e "${GREEN}Using Firebase project: $PROJECT_ID${NC}"
else
  echo -e "${RED}Error: .env.local file not found.${NC}"
  exit 1
fi

# Set the project
echo -e "\n${YELLOW}Setting Firebase project...${NC}"
firebase use "$PROJECT_ID"

# Validate Firestore rules
echo -e "\n${YELLOW}Validating Firestore security rules...${NC}"
if [ -f firestore.rules ]; then
  firebase firestore:rules --debug
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}Firestore rules validation successful.${NC}"
  else
    echo -e "${RED}Firestore rules validation failed.${NC}"
    exit 1
  fi
else
  echo -e "${RED}Error: firestore.rules file not found.${NC}"
  exit 1
fi

# Validate Storage rules
echo -e "\n${YELLOW}Validating Storage security rules...${NC}"
if [ -f storage.rules ]; then
  firebase storage:rules --debug
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}Storage rules validation successful.${NC}"
  else
    echo -e "${RED}Storage rules validation failed.${NC}"
    exit 1
  fi
else
  echo -e "${RED}Error: storage.rules file not found.${NC}"
  exit 1
fi

# Deploy Firestore and Storage rules
echo -e "\n${YELLOW}Deploying Firestore and Storage rules...${NC}"
firebase deploy --only firestore,storage

# Run the Firebase test script to validate configuration
echo -e "\n${YELLOW}Running Firebase validation tests...${NC}"
node -r dotenv/config src/tests/firebase-test.js

echo -e "\n${GREEN}========== Firebase Deployment Complete ==========${NC}" 