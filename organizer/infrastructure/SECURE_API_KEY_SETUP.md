# Secure API Key Deployment Guide

This guide explains how to securely deploy your AI API key (for code quality assessment) on the Azure VM.

## Security Best Practices

✅ **DO:**
- Store the API key in a file with restricted permissions (600 = owner read/write only)
- Use the provided `setup-api-key.sh` script
- Keep the key file in the user's home directory (`~/.hackathon-env`)
- Never commit API keys to git

❌ **DON'T:**
- Hardcode API keys in scripts
- Store keys in world-readable files
- Commit keys to version control
- Share keys via unencrypted channels

## Method 1: Using the Setup Script (Recommended)

### Step 1: Copy the setup script to the VM

```bash
scp organizer/infrastructure/setup-api-key.sh hackathon@<VM_IP>:~/
```

### Step 2: SSH into the VM and run the script

```bash
ssh hackathon@<VM_IP>
chmod +x ~/setup-api-key.sh

# Set Anthropic API key
~/setup-api-key.sh --anthropic-key "sk-ant-your-key-here"

# OR set OpenAI API key
~/setup-api-key.sh --openai-key "sk-your-key-here"
```

The script will:
- Create `~/.hackathon-env` with permissions 600 (readable only by you)
- Store the API key securely
- The `continuous-test.sh` script will automatically load it

### Step 3: Verify it's set

```bash
# Check file exists and has correct permissions
ls -l ~/.hackathon-env
# Should show: -rw------- (600 permissions)

# Test loading (don't print the actual key!)
source ~/.hackathon-env && echo "API key loaded: ${ANTHROPIC_API_KEY:+yes}" || echo "No key"
```

### Step 4: Restart the continuous tester (if running)

If the continuous tester is already running in tmux, restart it to pick up the new API key:

```bash
tmux kill-session -t tester
tmux new -d -s tester 'cd ~/hackathon && ./organizer/infrastructure/continuous-test.sh --output-dir ~/results --poll-interval 120'
```

## Method 2: Manual Setup (Alternative)

If you prefer to set it up manually:

```bash
ssh hackathon@<VM_IP>

# Create the file with your API key
echo "ANTHROPIC_API_KEY='sk-ant-your-key-here'" > ~/.hackathon-env
# OR
echo "OPENAI_API_KEY='sk-your-key-here'" > ~/.hackathon-env

# Restrict permissions (critical!)
chmod 600 ~/.hackathon-env

# Verify permissions
ls -l ~/.hackathon-env
# Should show: -rw------- (only owner can read/write)
```

## Removing the API Key

To remove the API key file:

```bash
ssh hackathon@<VM_IP>
~/setup-api-key.sh --remove
# OR manually:
rm ~/.hackathon-env
```

## How It Works

1. The `continuous-test.sh` script automatically checks for `~/.hackathon-env` on startup
2. If found, it sources the file to load `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
3. The testing client reads these environment variables when running AI code review
4. The file has permissions 600, so only the owner can read it

## Security Notes

- **File permissions (600)**: Only the file owner can read/write. Other users and processes cannot access it.
- **Location (`~/.hackathon-env`)**: In the user's home directory, not in the repository or world-readable locations.
- **Environment variables**: The key is loaded into the shell environment, not hardcoded in scripts.
- **No git tracking**: The `.gitignore` excludes `.env` files, so keys won't be committed.

## Troubleshooting

**API key not being used:**
- Check file exists: `ls -l ~/.hackathon-env`
- Check permissions: Should be `-rw-------` (600)
- Verify content: `cat ~/.hackathon-env` (be careful not to expose in logs!)
- Restart the continuous tester to reload environment

**Permission denied errors:**
- Ensure you're running as the `hackathon` user (not root)
- Check file ownership: `ls -l ~/.hackathon-env` should show `hackathon` as owner

**AI review still skipped:**
- Verify the key is loaded: `source ~/.hackathon-env && echo $ANTHROPIC_API_KEY | head -c 10`
- Check continuous-test.sh is not using `--skip-ai-review` flag
- Ensure `--code-path` is being passed to the testing client (it should be automatic)
