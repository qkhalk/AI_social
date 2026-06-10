"""
Deploy AI Social Network to server via SSH.
Usage: python scripts/deploy-to-server.py
"""

import paramiko
import time
import sys
import os

# Server config
HOST = os.environ.get("DEPLOY_HOST", "160.250.131.12")
USER = os.environ.get("DEPLOY_USER", "root")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REPO_URL = "https://github.com/qkhalk/AI_social.git"
APP_DIR = "/root/AI_social"

# Supabase config
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Cloudflare Turnstile
TURNSTILE_SITE_KEY = os.environ.get("TURNSTILE_SITE_KEY", "")
TURNSTILE_SECRET_KEY = os.environ.get("TURNSTILE_SECRET_KEY", "")

# Encryption key
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY", "")


def ssh_exec(ssh, cmd, desc="", timeout=300, quiet=False):
    """Execute command via SSH with output streaming."""
    if quiet:
        stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
        exit_code = stdout.channel.recv_exit_status()
        out = stdout.read().decode('utf-8', errors='replace').strip()
        return exit_code, out, stderr.read().decode('utf-8', errors='replace').strip()
    if desc:
        print(f"\n🔧 {desc}")
    print(f"   $ {cmd[:120]}{'...' if len(cmd) > 120 else ''}")

    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    
    # Read output continuously to prevent timeouts
    out_lines = []
    for line in iter(stdout.readline, ""):
        print(f"   {line.strip()}")
        out_lines.append(line.strip())
        
    exit_code = stdout.channel.recv_exit_status()
    out = "\n".join(out_lines)
    err = stderr.read().decode('utf-8', errors='replace').strip()

    if exit_code != 0 and err:
        print(f"   ⚠️  stderr: {err[:200]}")

    return exit_code, out, err


def main():
    print("=" * 60)
    print("  AI Social Network — Server Deployment")
    print("=" * 60)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    print(f"\n🔌 Connecting to {HOST}...")
    try:
        ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)
        ssh.get_transport().set_keepalive(30)
        print("   ✅ Connected!")
    except Exception as e:
        print(f"   ❌ Connection failed: {e}")
        sys.exit(1)

    try:
        # Check Docker and detect compose command
        code, out, _ = ssh_exec(ssh, "docker --version", "Check Docker")
        if code != 0:
            print("   Docker not installed. Install Docker first.")
            sys.exit(1)

        # Detect compose command (v2: "docker compose", v1: "docker-compose")
        code, _, _ = ssh_exec(ssh, "docker compose version 2>/dev/null", quiet=True)
        compose_cmd = "docker compose" if code == 0 else "docker-compose"
        print(f"   Using: {compose_cmd}")

        # Clone or pull repo
        code, _, _ = ssh_exec(ssh, f"test -d {APP_DIR}", "Check if repo exists")
        if code != 0:
            ssh_exec(ssh, f"git clone {REPO_URL} {APP_DIR}", "Clone repository")
        else:
            ssh_exec(ssh, f"cd {APP_DIR} && git pull origin master", "Pull latest code")

        # Create .env file
        print("\n📝 Creating .env file...")
        env_content = f"""# Supabase
SUPABASE_URL={SUPABASE_URL}
SUPABASE_ANON_KEY={SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY={SUPABASE_SERVICE_ROLE_KEY}

# OpenRouter (placeholder - user needs to add their key)
OPENROUTER_API_KEY=sk-or-v1-placeholder

# Cloudflare Turnstile
TURNSTILE_SITE_KEY={TURNSTILE_SITE_KEY}
TURNSTILE_SECRET_KEY={TURNSTILE_SECRET_KEY}

# Encryption
ENCRYPTION_KEY={ENCRYPTION_KEY}

# App
APP_URL=http://{HOST}:3000
"""
        # Write .env via SSH
        ssh_exec(ssh, f"cat > {APP_DIR}/.env << 'ENVEOF'\n{env_content}ENVEOF", "Write .env file")

        # Build and start containers
        ssh_exec(ssh, f"cd {APP_DIR} && {compose_cmd} build --no-cache 2>&1",
                 "Build Docker images (this takes a few minutes)...", timeout=900)

        ssh_exec(ssh, f"cd {APP_DIR} && {compose_cmd} up -d 2>&1", "Start containers")

        # Wait for services to start
        print("\n⏳ Waiting for services to start...")
        time.sleep(15)

        # Health checks
        ssh_exec(ssh, "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/",
                 "Web health check (port 3000)")
        ssh_exec(ssh, "curl -s http://localhost:4000/health 2>/dev/null || echo 'Agent service starting...'",
                 "Agent health check (port 4000)")

        # Show running containers
        ssh_exec(ssh, f"cd {APP_DIR} && {compose_cmd} ps", "Container status")

        print("\n" + "=" * 60)
        print("  🎉 Deployment Complete!")
        print("=" * 60)
        print(f"""
  Web app:     http://{HOST}:3000
  Signup:      http://{HOST}:3000/signup
  Login:       http://{HOST}:3000/login
  Admin:       http://{HOST}:3000/admin

  Next steps:
  1. Sign up at /signup
  2. In Supabase SQL Editor, run:
     UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
  3. Go to /admin to create agents and rooms
  4. Add your OpenRouter API key to .env on server:
     nano {APP_DIR}/.env
     (replace OPENROUTER_API_KEY placeholder)
     Then: cd {APP_DIR} && docker compose restart agent
""")

    except Exception as e:
        print(f"\n❌ Deployment failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        ssh.close()
        print("\n🔌 SSH connection closed.")


if __name__ == "__main__":
    main()
