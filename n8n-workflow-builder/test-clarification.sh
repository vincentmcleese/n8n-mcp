#!/bin/bash

# Test script for workflow builder with clarification responses
# This script pipes the prompt and clarification answers into the build-workflow script

# Define the prompt and responses
PROMPT="every time a client asks an annoying question, generate a smart response and email it to them"

# The clarification responses (one per line)
# Based on the questions Claude asks, we'll provide:
# 1. How to determine if annoying: "keywords like 'refund', 'discount', 'free'"
# 2. How clients ask: "through email"
# 3. What kind of smart responses: "AI-generated polite but firm responses"

# Use printf to send multiple lines of input
printf "%s\n%s\n%s\n%s\n" \
  "$PROMPT" \
  "keywords like 'refund', 'discount', 'free'" \
  "through email" \
  "AI-generated polite but firm responses" \
  | npm run test:buildworkflow