#!/usr/bin/env bash
# Exit on error, unset variable, or pipeline failure; trap errors for logging
set -euo pipefail
trap 'error "Error on line $LINENO: $BASH_COMMAND"' ERR
# Logging helpers
info()    { echo "[INFO] $*"; }
success() { echo "[SUCCESS] $*"; }
error()   { echo "[ERROR] $*" >&2; }

# Version parameter (required)
if [ $# -lt 1 ]; then
  error "Version parameter is required. Usage: $0 <version>"
  exit 1
fi
VERSION="$1"
info "Using Nash MCP version: $VERSION"

################################################################################
# 1. Determine paths and create directories
################################################################################
USER_HOME="$HOME"
NASH_DIR="${USER_HOME}/Library/Application Support/Nash"
LOGS_DIR="${NASH_DIR}/logs"
TIMESTAMP="$(date +'%Y%m%d-%H%M%S')"
LOG_FILE="${LOGS_DIR}/${TIMESTAMP}-installation.log"
# Create directories
mkdir -p "${NASH_DIR}" "${LOGS_DIR}"
# Set proper permissions - standard Application Support permissions
chmod 755 "${NASH_DIR}"  # User has full access, others can read/execute
chmod 755 "${LOGS_DIR}"  # User has full access, others can read/execute
touch "${LOG_FILE}"
chmod 644 "${LOG_FILE}"  # User can read/write, others can read
# Redirect all output to log file & console
exec > >(tee -a "$LOG_FILE") 2>&1
info "=== Starting installation script at $(date) ==="
info "Running as user: $(whoami)"
info "Home directory: $USER_HOME"
info "Nash directory: $NASH_DIR"
info "Log file: $LOG_FILE"
# Change working directory to avoid brew $PWD issues
cd "$USER_HOME"
info "Changed working directory to: $(pwd)"

################################################################################
# 2. Install required Homebrew dependencies
################################################################################
# Find Homebrew binary
if [[ -f "/opt/homebrew/bin/brew" ]]; then
  BREW_PATH="/opt/homebrew/bin/brew"
elif [[ -f "/usr/local/bin/brew" ]]; then
  BREW_PATH="/usr/local/bin/brew"
else
  error "Homebrew not found in expected locations"
  exit 1
fi
info "Using Homebrew at: $BREW_PATH"

# Install dependencies required for proper Python compilation
info "Installing dependencies required for Python compilation..."
DEPS=("openssl" "readline" "sqlite3" "xz" "zlib" "bzip2")
for dep in "${DEPS[@]}"; do
  info "Installing/updating dependency: $dep"
  "$BREW_PATH" install "$dep" || {
    error "Failed to install $dep"
    exit 1
  }
  success "$dep installed/updated"
done

################################################################################
# 3. Install pyenv if not already available
################################################################################
# Check if pyenv is already on the path
if command -v pyenv &>/dev/null; then
  info "pyenv is already installed and on your PATH"
  PYENV_BIN="$(command -v pyenv)"
else
  info "pyenv not found on PATH, installing via Homebrew..."
  "$BREW_PATH" install pyenv || {
    error "Failed to install pyenv"
    exit 1
  }
  success "pyenv installed via Homebrew"
  PYENV_BIN="$("$BREW_PATH" list pyenv | grep "/bin/pyenv$" | head -n 1)"
fi
info "Using pyenv at: $PYENV_BIN"

################################################################################
# 4. Install Python 3.11.11 with pyenv
################################################################################
TARGET_PYTHON_VERSION="3.11.11"

# Check if Python version is already installed in .pyenv
if [[ -d "${USER_HOME}/.pyenv/versions/${TARGET_PYTHON_VERSION}" ]]; then
  info "Python ${TARGET_PYTHON_VERSION} is already installed in pyenv"
else
  info "Installing Python ${TARGET_PYTHON_VERSION} via pyenv..."
  "${PYENV_BIN}" install "${TARGET_PYTHON_VERSION}" || {
    error "pyenv installation of Python ${TARGET_PYTHON_VERSION} failed"
    exit 1
  }
  success "Python ${TARGET_PYTHON_VERSION} installed"
fi

################################################################################
# 5. Download and set up Nash MCP repository
################################################################################
NASH_MCP_ZIP_URL="https://github.com/nash-app/nash-mcp/archive/refs/tags/v$VERSION.zip"
NASH_MCP_ZIP="$NASH_DIR/nash-mcp-v$VERSION.zip"
NASH_MCP_EXTRACT_DIR="$NASH_DIR/nash-mcp-$VERSION"
info "Downloading Nash MCP repository..."
curl -L "$NASH_MCP_ZIP_URL" -o "$NASH_MCP_ZIP" || {
  error "Failed to download Nash MCP repository"
  exit 1
}
success "Downloaded Nash MCP repository to $NASH_MCP_ZIP"
info "Unzipping Nash MCP repository..."
unzip -q -o "$NASH_MCP_ZIP" -d "$NASH_DIR" || {
  error "Failed to unzip Nash MCP repository"
  exit 1
}
success "Unzipped Nash MCP repository to $NASH_DIR"
# Find the actual directory name after extraction
NASH_MCP_DIR=$(find "$NASH_DIR" -maxdepth 1 -type d -name "nash-mcp*" | head -n 1)
if [ -z "$NASH_MCP_DIR" ]; then
  error "Could not find the extracted Nash MCP directory"
  exit 1
fi
info "Found Nash MCP directory at: $NASH_MCP_DIR"
info "Removing zip file..."
rm "$NASH_MCP_ZIP" || {
  error "Failed to remove Nash MCP zip file"
  exit 1
}
success "Removed Nash MCP zip file"

################################################################################
# 6. Create a virtual environment in the Nash MCP directory
################################################################################
VENV_PATH="$NASH_MCP_DIR/.venv"
info "Ensuring venv at: $VENV_PATH"
# Get the Python executable from pyenv
PYTHON_EXE="$("$PYENV_BIN" root)/versions/$TARGET_PYTHON_VERSION/bin/python"
info "Creating new virtual environment with Python $TARGET_PYTHON_VERSION..."
rm -rf "$VENV_PATH"
"$PYTHON_EXE" -m venv "$VENV_PATH" || {
  error "Failed to create venv at $VENV_PATH"
  exit 1
}
success "Virtual environment created at: $VENV_PATH"
info "Upgrading pip, setuptools, wheel in the virtual environment..."
"$VENV_PATH/bin/pip" install --upgrade pip setuptools wheel || {
  error "Failed to upgrade pip, setuptools, wheel in venv"
  exit 1
}
success "Upgraded pip, setuptools, wheel in the venv"

################################################################################
# 7. Install Poetry and project dependencies
################################################################################
info "Installing Poetry in the virtual environment..."
"$VENV_PATH/bin/pip" install poetry || {
  error "Failed to install Poetry in venv"
  exit 1
}
success "Installed Poetry in the virtual environment"

info "Installing project dependencies with Poetry..."
cd "$NASH_MCP_DIR"
# First check if pyproject.toml exists
if [ -f "$NASH_MCP_DIR/pyproject.toml" ]; then
  # Try to install dependencies with Poetry
  "$VENV_PATH/bin/poetry" config virtualenvs.create false && "$VENV_PATH/bin/poetry" install --no-interaction --no-cache || {
    info "Poetry install encountered issues, trying alternative installation method..."
    # If poetry install fails, try to install requirements directly if requirements.txt exists
    if [ -f "$NASH_MCP_DIR/requirements.txt" ]; then
      "$VENV_PATH/bin/pip" install -r "$NASH_MCP_DIR/requirements.txt" || {
        error "Failed to install requirements from requirements.txt"
        exit 1
      }
      success "Installed dependencies from requirements.txt"
    else
      info "No requirements.txt found, continuing without installing additional dependencies"
    fi
  }
else
  info "No pyproject.toml found, checking for requirements.txt..."
  # If no pyproject.toml, try requirements.txt
  if [ -f "$NASH_MCP_DIR/requirements.txt" ]; then
    "$VENV_PATH/bin/pip" install -r "$NASH_MCP_DIR/requirements.txt" || {
      error "Failed to install requirements from requirements.txt"
      exit 1
    }
    success "Installed dependencies from requirements.txt"
  else
    info "No dependency files found, continuing without installing additional dependencies"
  fi
fi

################################################################################
# 8. Create .nash directory, run_mcp.sh script, and environment file
################################################################################
NASH_HOME_DIR="$USER_HOME/.nash"
info "Creating .nash directory at: $NASH_HOME_DIR"
mkdir -p "$NASH_HOME_DIR"

# Create the environment variables file
ENV_FILE="$NASH_MCP_DIR/.env"
info "Creating environment file at: $ENV_FILE"
cat > "$ENV_FILE" << EOL
# Nash MCP Environment Variables

# Base directory for Nash MCP data
NASH_BASE_PATH=${NASH_DIR}

# Paths for specific data files
NASH_SECRETS_PATH=${NASH_DIR}/secrets.json
NASH_TASKS_PATH=${NASH_DIR}/tasks.json
NASH_LOGS_PATH=${NASH_DIR}/logs
EOL
chmod 644 "$ENV_FILE"  # User can read/write, others can read
success "Created environment file: $ENV_FILE"

# Create the run_mcp.sh script
RUN_MCP_SCRIPT="$NASH_HOME_DIR/run_mcp.sh"
info "Creating run_mcp.sh script at: $RUN_MCP_SCRIPT"
cat > "$RUN_MCP_SCRIPT" << EOL
#!/bin/bash
source ~/Library/Application\ Support/Nash/nash-mcp-${VERSION}/.venv/bin/activate
mcp run ~/Library/Application\ Support/Nash/nash-mcp-${VERSION}/src/nash_mcp/server.py
EOL
chmod +x "$RUN_MCP_SCRIPT"
success "Created and made executable: $RUN_MCP_SCRIPT"

################################################################################
# 9. Summary
################################################################################
info "=== Installation script finished at $(date) ==="
success "Nash MCP repository has been set up at: $NASH_MCP_DIR"
success "Python $TARGET_PYTHON_VERSION is installed"
info "Virtual environment: $VENV_PATH"
info "You can run: \"$VENV_PATH/bin/python\" --version"
info "Log file: $LOG_FILE"