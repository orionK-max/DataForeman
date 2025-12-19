#!/bin/bash
# Node Test Runner Helper Script
# Makes it easy to run and monitor node tests

set -e

CORE_DIR="/home/parallels/Documents/DataForeman/core"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Function to run all tests
run_all() {
    print_header "Running All Node Tests"
    cd "$CORE_DIR"
    npm test
}

# Function to run tests for a specific node
run_node() {
    local node_name="$1"
    print_header "Running Tests for ${node_name}"
    cd "$CORE_DIR"
    npm test -- "$node_name"
}

# Function to run tests in watch mode
run_watch() {
    print_header "Starting Test Watch Mode"
    cd "$CORE_DIR"
    npm test -- --watch
}

# Function to run tests with coverage
run_coverage() {
    print_header "Running Tests with Coverage"
    cd "$CORE_DIR"
    npm test -- --coverage
}

# Function to show test summary
show_summary() {
    print_header "Test Summary"
    cd "$CORE_DIR"
    npm test 2>&1 | grep -E "(Test Files|Tests|Duration)" || true
}

# Function to list failing tests
list_failures() {
    print_header "Failing Tests"
    cd "$CORE_DIR"
    npm test 2>&1 | grep -E "FAIL|×" | head -50 || echo "No failures found!"
}

# Function to run specific test category
run_category() {
    local category="$1"
    print_header "Running ${category} Tests"
    cd "$CORE_DIR"
    case "$category" in
        comparison)
            npm test -- ComparisonNode
            ;;
        logic)
            npm test -- "BooleanLogicNode|GateNode|RangeCheckNode|SwitchNode"
            ;;
        data)
            npm test -- "StringOpsNode|TypeConvertNode"
            ;;
        math)
            npm test -- MathNode
            ;;
        tags)
            npm test -- "TagInputNode|TagOutputNode"
            ;;
        utility)
            npm test -- "ConstantNode|CommentNode"
            ;;
        scripts)
            npm test -- JavaScriptNode
            ;;
        triggers)
            npm test -- ManualTriggerNode
            ;;
        *)
            print_error "Unknown category: $category"
            echo "Available categories: comparison, logic, data, math, tags, utility, scripts, triggers"
            exit 1
            ;;
    esac
}

# Show usage
show_usage() {
    cat << EOF
${BLUE}Node Test Runner${NC}

Usage: $0 [command] [options]

Commands:
    all              Run all node tests
    node <name>      Run tests for specific node (e.g., MathNode, ComparisonNode)
    category <cat>   Run tests for category (comparison, logic, data, math, tags, utility, scripts, triggers)
    watch            Run tests in watch mode
    coverage         Run tests with coverage report
    summary          Show quick test summary
    failures         List only failing tests
    help             Show this help message

Examples:
    $0 all                      # Run all tests
    $0 node MathNode            # Test only MathNode
    $0 category logic           # Test all logic nodes
    $0 watch                    # Watch mode for TDD
    $0 failures                 # See what's failing

EOF
}

# Main script
case "${1:-help}" in
    all)
        run_all
        ;;
    node)
        if [ -z "$2" ]; then
            print_error "Node name required"
            echo "Usage: $0 node <NodeName>"
            exit 1
        fi
        run_node "$2"
        ;;
    category)
        if [ -z "$2" ]; then
            print_error "Category name required"
            echo "Usage: $0 category <category>"
            exit 1
        fi
        run_category "$2"
        ;;
    watch)
        run_watch
        ;;
    coverage)
        run_coverage
        ;;
    summary)
        show_summary
        ;;
    failures)
        list_failures
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        print_error "Unknown command: $1"
        show_usage
        exit 1
        ;;
esac
