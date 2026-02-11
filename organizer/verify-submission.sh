#!/usr/bin/env bash
#
# verify-submission.sh -- Verify submission meets requirements
#
# This script checks that a submission directory meets all the
# requirements from SUBMISSION.md
#
# Usage:
#   ./verify-submission.sh <submission-directory>
#
# Example:
#   ./verify-submission.sh ~/test-submission-repo

set -euo pipefail

TARGET_DIR="${1:-}"

if [ -z "$TARGET_DIR" ]; then
    echo "Error: Submission directory required"
    echo ""
    echo "Usage: $0 <submission-directory>"
    exit 1
fi

if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Directory not found: $TARGET_DIR"
    exit 1
fi

echo "Verifying submission: $TARGET_DIR"
echo ""

ERRORS=0

# Check 1: Dockerfile exists in root
echo -n "✓ Checking Dockerfile in root... "
if [ -f "$TARGET_DIR/Dockerfile" ]; then
    echo "OK"
else
    echo "FAIL"
    echo "  Error: Dockerfile not found in $TARGET_DIR"
    ERRORS=$((ERRORS + 1))
fi

# Check 2: Dockerfile exposes port 8080
echo -n "✓ Checking Dockerfile exposes port 8080... "
if grep -q "EXPOSE 8080" "$TARGET_DIR/Dockerfile" 2>/dev/null; then
    echo "OK"
else
    echo "FAIL"
    echo "  Error: Dockerfile does not expose port 8080"
    ERRORS=$((ERRORS + 1))
fi

# Check 3: Project file exists (for .NET)
echo -n "✓ Checking project file... "
if [ -f "$TARGET_DIR/PensionCalculationEngine.csproj" ] || \
   [ -f "$TARGET_DIR/*.csproj" ] 2>/dev/null; then
    echo "OK"
else
    echo "WARN (may not be .NET project)"
fi

# Check 4: Program.cs or main entry point exists
echo -n "✓ Checking main entry point... "
if [ -f "$TARGET_DIR/Program.cs" ] || \
   [ -f "$TARGET_DIR/src/index.js" ] || \
   [ -f "$TARGET_DIR/main.go" ] || \
   [ -f "$TARGET_DIR/src/main.py" ]; then
    echo "OK"
else
    echo "WARN (entry point not found)"
fi

# Check 5: Docker build test (optional, can be slow)
echo ""
echo "Optional: Test Docker build? (y/n)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    echo ""
    echo "Building Docker image (this may take a few minutes)..."
    cd "$TARGET_DIR"
    if docker build -t verify-submission-test . > /tmp/docker-build.log 2>&1; then
        echo "✓ Docker build successful"
        
        # Test container starts
        echo ""
        echo "Testing container startup..."
        CONTAINER_ID=$(docker run -d -p 8080:8080 verify-submission-test 2>&1)
        sleep 3
        
        if docker ps | grep -q "$CONTAINER_ID"; then
            echo "✓ Container started successfully"
            
            # Test health endpoint (if available)
            echo ""
            echo "Testing HTTP endpoint..."
            if curl -s -f -X POST http://localhost:8080/calculation-requests \
                -H "Content-Type: application/json" \
                -d '{"tenant_id":"test","calculation_instructions":{"mutations":[]}}' > /dev/null 2>&1; then
                echo "✓ HTTP endpoint responds"
            else
                echo "⚠ HTTP endpoint test failed (may need valid request)"
            fi
            
            # Cleanup
            docker stop "$CONTAINER_ID" > /dev/null 2>&1
            docker rm "$CONTAINER_ID" > /dev/null 2>&1
        else
            echo "⚠ Container started but may have crashed (check logs)"
            docker logs "$CONTAINER_ID" 2>&1 | tail -20
            docker rm "$CONTAINER_ID" > /dev/null 2>&1
        fi
        
        # Cleanup image
        docker rmi verify-submission-test > /dev/null 2>&1
    else
        echo "✗ Docker build failed"
        echo "  Check /tmp/docker-build.log for details"
        ERRORS=$((ERRORS + 1))
    fi
fi

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "✓ Verification complete - submission looks good!"
    exit 0
else
    echo "✗ Verification found $ERRORS error(s)"
    exit 1
fi
