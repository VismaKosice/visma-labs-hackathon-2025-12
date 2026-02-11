#!/usr/bin/env bash
#
# setup-vm.sh -- Set up the Azure VM as a hackathon test runner.
#
# Run this script on a fresh Ubuntu 22.04 VM.
# It installs Docker, Node.js 20, and tunes the system for consistent
# performance benchmarking.
#
set -euo pipefail

echo "=== Hackathon Test Runner VM Setup ==="
echo ""

# -------------------------------------------------------------------
# 1. System updates
# -------------------------------------------------------------------
echo "[1/8] Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# -------------------------------------------------------------------
# 2. Install Docker
# -------------------------------------------------------------------
echo "[2/8] Installing Docker..."
if ! command -v docker &>/dev/null; then
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin

    # Allow current user to run docker without sudo
    sudo usermod -aG docker "$USER"
    echo "  Docker installed. You may need to log out and back in for group changes."
else
    echo "  Docker already installed: $(docker --version)"
fi

# -------------------------------------------------------------------
# 3. Install Node.js 20
# -------------------------------------------------------------------
echo "[3/8] Installing Node.js 20..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "  Node.js installed: $(node -v)"
else
    echo "  Node.js already installed: $(node -v)"
fi

# -------------------------------------------------------------------
# 4. Install useful tools
# -------------------------------------------------------------------
echo "[4/8] Installing additional tools..."
sudo apt-get install -y jq git curl htop sysstat linux-tools-common "linux-tools-$(uname -r)" 2>/dev/null || \
    sudo apt-get install -y jq git curl htop sysstat linux-tools-common

# -------------------------------------------------------------------
# 5. Create directory structure
# -------------------------------------------------------------------
echo "[5/8] Creating directory structure..."
mkdir -p ~/hackathon
mkdir -p ~/results
mkdir -p ~/repos

echo "  ~/hackathon  -- repository clone and testing client"
echo "  ~/results    -- test result JSON files"
echo "  ~/repos      -- cloned team source code for AI review"

# -------------------------------------------------------------------
# 6. CPU performance tuning (fairness: consistent clock speed)
# -------------------------------------------------------------------
echo "[6/8] Configuring CPU performance tuning..."

# On Azure VMs, CPU frequency scaling may not be available (hypervisor-managed),
# but we try anyway in case the VM supports it.
if command -v cpupower &>/dev/null; then
    sudo cpupower frequency-set -g performance 2>/dev/null || \
        echo "  cpupower: governor not changeable (expected on Azure VMs)"
elif [[ -d /sys/devices/system/cpu/cpu0/cpufreq ]]; then
    for cpu in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
        echo "performance" | sudo tee "$cpu" 2>/dev/null || true
    done
    echo "  Set CPU governor to 'performance' via sysfs"
else
    echo "  CPU frequency scaling not available (hypervisor-managed — this is normal on Azure)"
fi

# Disable CPU idle states for more consistent latency (optional, uncomment if needed)
# for cpu in /sys/devices/system/cpu/cpu*/cpuidle/state*/disable; do
#     echo 1 | sudo tee "$cpu" 2>/dev/null || true
# done

# -------------------------------------------------------------------
# 7. Kernel / OS tuning for benchmarking
# -------------------------------------------------------------------
echo "[7/8] Applying kernel tuning for consistent benchmarks..."

# Increase file descriptor limits (autocannon + many connections)
cat <<'LIMITS' | sudo tee /etc/security/limits.d/99-hackathon.conf > /dev/null
*    soft    nofile    65535
*    hard    nofile    65535
*    soft    nproc     65535
*    hard    nproc     65535
LIMITS
echo "  File descriptor limits set to 65535"

# Increase network connection tracking and socket buffers
cat <<'SYSCTL' | sudo tee /etc/sysctl.d/99-hackathon.conf > /dev/null
# Allow more local ports for outbound connections
net.ipv4.ip_local_port_range = 1024 65535

# Increase socket backlog
net.core.somaxconn = 4096
net.core.netdev_max_backlog = 4096

# TCP fast recycling (useful for repeated connections in perf tests)
net.ipv4.tcp_tw_reuse = 1

# Increase TCP buffer sizes
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 87380 16777216

# Disable swap aggressiveness (keep test processes in RAM)
vm.swappiness = 10

# Don't let dirty pages accumulate (avoid I/O bursts)
vm.dirty_ratio = 10
vm.dirty_background_ratio = 5
SYSCTL

sudo sysctl --system > /dev/null 2>&1
echo "  Sysctl parameters applied"

# Disable transparent huge pages (can cause latency spikes)
if [[ -f /sys/kernel/mm/transparent_hugepage/enabled ]]; then
    echo never | sudo tee /sys/kernel/mm/transparent_hugepage/enabled > /dev/null 2>&1 || true
    echo never | sudo tee /sys/kernel/mm/transparent_hugepage/defrag > /dev/null 2>&1 || true
    echo "  Transparent huge pages disabled"
fi

# -------------------------------------------------------------------
# 8. Summary
# -------------------------------------------------------------------
echo ""
echo "[8/8] Setup complete!"
echo ""
echo "=== System Info ==="
echo "  CPUs:    $(nproc)"
echo "  Memory:  $(free -h | awk '/Mem:/ {print $2}')"
echo "  Docker:  $(docker --version 2>/dev/null || echo 'not available yet — re-login for group access')"
echo "  Node.js: $(node -v 2>/dev/null || echo 'not found')"
echo "  Kernel:  $(uname -r)"
echo ""
echo "=== Next Steps ==="
echo ""
echo "1. Log out and back in (for Docker group access):"
echo "   exit"
echo ""
echo "2. Clone the hackathon repository:"
echo "   git clone https://github.com/<GITHUB_ORG>/hackathon-2025.git ~/hackathon"
echo ""
echo "3. Set up the testing client:"
echo "   cd ~/hackathon/testing-client"
echo "   npm install"
echo ""
echo "4. Set AI review API key (for code quality scoring):"
echo "   export ANTHROPIC_API_KEY='your-key-here'"
echo "   # or"
echo "   export OPENAI_API_KEY='your-key-here'"
echo ""
echo "5. Run a dry-run test to verify everything works:"
echo "   cd ~/hackathon"
echo "   ./organizer/infrastructure/run-all-teams.sh --help"
echo ""
echo "=== Fairness Notes ==="
echo ""
echo "  This VM is tuned for consistent benchmarking:"
echo "  - CPU governor set to 'performance' (if available)"
echo "  - Transparent huge pages disabled"
echo "  - vm.swappiness = 10 (minimize swap)"
echo "  - TCP buffers and port ranges increased"
echo "  - File descriptor limits raised to 65535"
echo ""
echo "  Before running final scoring:"
echo "  - Close all unnecessary SSH sessions"
echo "  - Ensure no other Docker containers are running"
echo "  - Verify load is low: cat /proc/loadavg"
echo ""
