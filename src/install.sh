#!/usr/bin/env bash
set -euo pipefail
trap 'error "Error on line $LINENO: $BASH_COMMAND"' ERR

# Logging helpers
info()    { echo "[INFO] $*"; }
success() { echo "[SUCCESS] $*"; }
error()   { echo "[ERROR] $*" >&2; }

# Version parameters (required)
if [ $# -lt 2 ]; then
  error "Both MCP and Local Server version parameters are required. Usage: $0 <mcp_server_version> <local_server_version>"
  exit 1
fi
NASH_MCP_SERVER_VERSION="$1"
NASH_LOCAL_SERVER_VERSION="$2"
info "Using Nash MCP version: $NASH_MCP_SERVER_VERSION"
info "Using Nash Local Server version: $NASH_LOCAL_SERVER_VERSION"

################################################################################
# 1. COMMON SETUP: System Preparation
################################################################################
USER_HOME="$HOME"
NASH_DIR="${USER_HOME}/Library/Application Support/Nash"
LOGS_DIR="${NASH_DIR}/logs"
SESSIONS_DIR="${NASH_DIR}/sessions"
TIMESTAMP="$(date +'%Y%m%d-%H%M%S')"
LOG_FILE="${LOGS_DIR}/${TIMESTAMP}-installation.log"
mkdir -p "${NASH_DIR}" "${LOGS_DIR}" "${SESSIONS_DIR}"
chmod 755 "${NASH_DIR}"
chmod 755 "${LOGS_DIR}"
chmod 755 "${SESSIONS_DIR}"
touch "${LOG_FILE}"
chmod 644 "${LOG_FILE}"
exec > >(tee -a "$LOG_FILE") 2>&1
info "=== Starting installation script at $(date) ==="
info "Running as user: $(whoami)"
info "Home directory: $USER_HOME"
info "Nash directory: $NASH_DIR"
info "Log file: $LOG_FILE"
cd "$USER_HOME"
info "Changed working directory to: $(pwd)"

################################################################################
# 2. COMMON SETUP: Homebrew Location (Install if missing)
################################################################################

# Function to install Command Line Tools
install_command_line_tools() {
  info "Installing Command Line Tools..."
  
  # Check if Command Line Tools are already installed
  if xcode-select -p &>/dev/null; then
    info "Command Line Tools are already installed."
    return 0
  fi
  
  # This will trigger the GUI prompt for installing Command Line Tools
  info "Triggering Command Line Tools installation GUI prompt..."
  xcode-select --install &
  
  # Display a notification to the user
  osascript -e 'display notification "Please click \"Install\" in the Command Line Tools installation prompt" with title "Command Line Tools Required"'
  
  # Poll for installation completion
  info "Waiting for Command Line Tools installation to complete (this may take several minutes)..."
  while ! xcode-select -p &>/dev/null; do
    sleep 5
    echo -n "."
  done
  echo "" # New line after dots
  
  # Verify installation
  if xcode-select -p &>/dev/null; then
    success "Command Line Tools installed successfully"
    return 0
  else
    error "Command Line Tools installation verification failed"
    return 1
  fi
}

# Function to install Homebrew via pkg installer
install_homebrew_pkg() {
  info "Installing Homebrew via pkg installer..."
  
  # First, ensure Command Line Tools are installed
  install_command_line_tools || {
    error "Command Line Tools installation failed, cannot proceed with Homebrew installation"
    exit 1
  }
  
  # Set the desired user for Homebrew installation
  ORIGINAL_USER="$(stat -f%Su /dev/console)"
  
  # Create the plist file to specify the install user
  info "Setting install user to: $ORIGINAL_USER"
  defaults write /var/tmp/.homebrew_pkg_user HOMEBREW_PKG_USER "$ORIGINAL_USER"
  
  # Direct link to the Homebrew pkg installer
  BREW_PKG="/tmp/homebrew.pkg"
  BREW_PKG_URL="https://github.com/Homebrew/brew/releases/download/4.4.26/Homebrew-4.4.26.pkg"
  
  info "Downloading Homebrew package from $BREW_PKG_URL to $BREW_PKG..."
  curl -L -o "$BREW_PKG" "$BREW_PKG_URL"
  
  if [ ! -f "$BREW_PKG" ] || [ ! -s "$BREW_PKG" ]; then
    error "Failed to download Homebrew package"
    exit 1
  fi
  
  info "Downloaded Homebrew package ($(du -h "$BREW_PKG" | cut -f1) in size)"
  
  # Install the pkg with admin privileges (this will prompt for password via GUI)
  info "Installing Homebrew.pkg with administrator privileges..."
  osascript -e "do shell script \"installer -pkg '$BREW_PKG' -target /\" with administrator privileges" || {
    error "Failed to install Homebrew via pkg installer"
    rm -f "$BREW_PKG"
    rm -f "/var/tmp/.homebrew_pkg_user.plist"
    exit 1
  }
  
  # Clean up
  info "Cleaning up temporary files..."
  rm -f "$BREW_PKG"
  rm -f "/var/tmp/.homebrew_pkg_user.plist"
  success "Homebrew installed successfully"
}

# Check for Homebrew
if [[ -f "/opt/homebrew/bin/brew" ]]; then
  BREW_PATH="/opt/homebrew/bin/brew"
  info "Found Homebrew at $BREW_PATH (Apple Silicon)"
elif [[ -f "/usr/local/bin/brew" ]]; then
  BREW_PATH="/usr/local/bin/brew"
  info "Found Homebrew at $BREW_PATH (Intel)"
else
  info "Homebrew not found. Installing via pkg installer..."
  install_homebrew_pkg
  
  # Now check again for Homebrew after installation
  if [[ -f "/opt/homebrew/bin/brew" ]]; then
    BREW_PATH="/opt/homebrew/bin/brew"
    info "Using newly installed Homebrew at $BREW_PATH (Apple Silicon)"
  elif [[ -f "/usr/local/bin/brew" ]]; then
    BREW_PATH="/usr/local/bin/brew"
    info "Using newly installed Homebrew at $BREW_PATH (Intel)"
  else
    error "Homebrew installed but not found in expected location"
    exit 1
  fi
fi

# Add Homebrew to PATH for this script session if needed
if ! command -v brew &>/dev/null; then
  if [[ -f "/opt/homebrew/bin/brew" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    info "Added Homebrew to PATH for this session"
  elif [[ -f "/usr/local/bin/brew" ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
    info "Added Homebrew to PATH for this session"
  fi
fi

info "Using Homebrew at: $BREW_PATH"
info "Homebrew version: $($BREW_PATH --version | head -1)"

################################################################################
# 3. COMMON SETUP: Homebrew Dependencies for Building Python from Source
################################################################################
info "Installing dependencies required for Python compilation..."
DEPS=("openssl@3" "readline" "sqlite" "xz" "zlib" "bzip2" "gettext")
for dep in "${DEPS[@]}"; do
  info "Installing/updating dependency: $dep"
  "$BREW_PATH" install "$dep" || {
    error "Failed to install $dep"
    exit 1
  }
  success "$dep installed/updated"
done

# Force link gettext to ensure proper linking
"$BREW_PATH" link --force gettext || true

################################################################################
# 4. COMMON SETUP: pyenv
################################################################################
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
  PYENV_BIN="$($BREW_PATH list pyenv | grep "/bin/pyenv$" | head -n 1)"
fi
info "Using pyenv at: $PYENV_BIN"

################################################################################
# 5. COMMON SETUP: Python Installation (Optimized Compilation)
################################################################################
TARGET_PYTHON_VERSION="3.11.11"

# Function to install Python with pyenv using optimized compilation settings
install_python_with_pyenv() {
  info "Installing Python ${TARGET_PYTHON_VERSION} via pyenv..."
  
  # Check if Python is already installed with pyenv
  if [[ -d "${USER_HOME}/.pyenv/versions/${TARGET_PYTHON_VERSION}" ]]; then
    info "Python ${TARGET_PYTHON_VERSION} is already installed in pyenv"
    return 0
  fi
  
  # Set architecture-specific build options
  if [[ "$(uname -m)" == "arm64" ]]; then
    info "Detected Apple Silicon (ARM64) architecture"
    # ARM64-specific optimizations
    export PYTHON_CONFIGURE_OPTS="--enable-framework --with-dtrace"
    export CFLAGS="-I$($BREW_PATH --prefix openssl@3)/include -I$($BREW_PATH --prefix readline)/include -I$($BREW_PATH --prefix sqlite)/include -I$($BREW_PATH --prefix zlib)/include -I$($BREW_PATH --prefix bzip2)/include -I$($BREW_PATH --prefix xz)/include -I$($BREW_PATH --prefix gettext)/include"
    export LDFLAGS="-L$($BREW_PATH --prefix openssl@3)/lib -L$($BREW_PATH --prefix readline)/lib -L$($BREW_PATH --prefix sqlite)/lib -L$($BREW_PATH --prefix zlib)/lib -L$($BREW_PATH --prefix bzip2)/lib -L$($BREW_PATH --prefix xz)/lib -L$($BREW_PATH --prefix gettext)/lib"
    export PKG_CONFIG_PATH="$($BREW_PATH --prefix openssl@3)/lib/pkgconfig:$($BREW_PATH --prefix readline)/lib/pkgconfig:$($BREW_PATH --prefix sqlite)/lib/pkgconfig:$($BREW_PATH --prefix zlib)/lib/pkgconfig:$($BREW_PATH --prefix bzip2)/lib/pkgconfig:$($BREW_PATH --prefix xz)/lib/pkgconfig:$($BREW_PATH --prefix gettext)/lib/pkgconfig"
  else
    info "Detected Intel architecture"
    # Intel-specific optimizations
    export PYTHON_CONFIGURE_OPTS="--enable-framework --with-dtrace"
    export CFLAGS="-I$($BREW_PATH --prefix openssl@3)/include -I$($BREW_PATH --prefix readline)/include -I$($BREW_PATH --prefix sqlite)/include"
    export LDFLAGS="-L$($BREW_PATH --prefix openssl@3)/lib -L$($BREW_PATH --prefix readline)/lib -L$($BREW_PATH --prefix sqlite)/lib"
  fi
  
  # Special handling for gettext on ARM64 which can cause issues
  if [[ "$(uname -m)" == "arm64" ]]; then
    info "Ensuring gettext libraries are properly linked..."
    $BREW_PATH link --force gettext
  fi
  
  # Enable parallel builds for faster compilation
  export PYTHON_MAKE_OPTS="-j$(sysctl -n hw.ncpu)"
  
  # Attempt to install with pyenv
  info "Compiling Python ${TARGET_PYTHON_VERSION} (this may take several minutes)..."
  pyenv install -v "${TARGET_PYTHON_VERSION}" || {
    error "Failed to install Python ${TARGET_PYTHON_VERSION} with pyenv"
    # Log useful information for debugging
    info "Architecture: $(uname -m)"
    info "CFLAGS: $CFLAGS"
    info "LDFLAGS: $LDFLAGS"
    info "See the complete build log for more details"
    exit 1
  }
  
  # Set as global Python version
  pyenv global "${TARGET_PYTHON_VERSION}"
  
  # Verify the installation
  if pyenv which python | grep -q "${TARGET_PYTHON_VERSION}"; then
    success "Python ${TARGET_PYTHON_VERSION} installed successfully"
    info "Python location: $(pyenv which python)"
    info "Python version: $(pyenv which python | xargs -I{} {} --version)"
    return 0
  else
    error "Python ${TARGET_PYTHON_VERSION} installation verification failed"
    exit 1
  fi
}

# Install Python using pyenv
install_python_with_pyenv

################################################################################
# 6. NASH MCP SERVER: Download and Installation
################################################################################
NASH_MCP_ZIP_URL="https://github.com/nash-app/nash-mcp/archive/refs/tags/v$NASH_MCP_SERVER_VERSION.zip"
NASH_MCP_ZIP="$NASH_DIR/nash-mcp-v$NASH_MCP_SERVER_VERSION.zip"
NASH_MCP_EXTRACT_DIR="$NASH_DIR/nash-mcp-$NASH_MCP_SERVER_VERSION"
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
# 7. NASH MCP SERVER: Python Environment Setup
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
# 8. NASH MCP SERVER: Dependencies Installation
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
  POETRY_VIRTUALENVS_CREATE=false "$VENV_PATH/bin/poetry" install --no-interaction --no-cache || {
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
# 9. NASH MCP SERVER: Configuration and Run Script
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
NASH_MODELS_PATH=${NASH_DIR}/models.json
NASH_SESSIONS_PATH=${NASH_DIR}/sessions
NASH_LOGS_PATH=${NASH_DIR}/logs
EOL
chmod 644 "$ENV_FILE"  # User can read/write, others can read
success "Created environment file: $ENV_FILE"

# Create the run_mcp.sh script
RUN_MCP_SCRIPT="$NASH_HOME_DIR/run_mcp.sh"
info "Creating run_mcp.sh script at: $RUN_MCP_SCRIPT"
cat > "$RUN_MCP_SCRIPT" << EOL
#!/bin/bash
source ~/Library/Application\ Support/Nash/nash-mcp-${NASH_MCP_SERVER_VERSION}/.venv/bin/activate
mcp run ~/Library/Application\ Support/Nash/nash-mcp-${NASH_MCP_SERVER_VERSION}/src/nash_mcp/server.py
EOL
chmod +x "$RUN_MCP_SCRIPT"
success "Created and made executable: $RUN_MCP_SCRIPT"

################################################################################
# 10. NASH LOCAL SERVER: Download and Installation
################################################################################
NASH_LOCAL_SERVER_ZIP_URL="https://github.com/nash-app/nash-local-server/archive/refs/tags/v$NASH_LOCAL_SERVER_VERSION.zip"
NASH_LOCAL_SERVER_ZIP="$NASH_DIR/nash-local-server-v$NASH_LOCAL_SERVER_VERSION.zip"
info "Downloading Nash Local Server repository..."
curl -L "$NASH_LOCAL_SERVER_ZIP_URL" -o "$NASH_LOCAL_SERVER_ZIP" || {
  error "Failed to download Nash Local Server repository"
  exit 1
}
success "Downloaded Nash Local Server repository to $NASH_LOCAL_SERVER_ZIP"

info "Unzipping Nash Local Server repository..."
unzip -q -o "$NASH_LOCAL_SERVER_ZIP" -d "$NASH_DIR" || {
  error "Failed to unzip Nash Local Server repository"
  exit 1
}
success "Unzipped Nash Local Server repository to $NASH_DIR"

# Find the actual directory name after extraction
NASH_LOCAL_SERVER_DIR=$(find "$NASH_DIR" -maxdepth 1 -type d -name "nash-local-server*" | head -n 1)
if [ -z "$NASH_LOCAL_SERVER_DIR" ]; then
  error "Could not find the extracted Nash Local Server directory"
  exit 1
fi
info "Found Nash Local Server directory at: $NASH_LOCAL_SERVER_DIR"

info "Removing zip file..."
rm "$NASH_LOCAL_SERVER_ZIP" || {
  error "Failed to remove Nash Local Server zip file"
  exit 1
}
success "Removed Nash Local Server zip file"

################################################################################
# 11. NASH LOCAL SERVER: Python Environment and Dependencies Installation
################################################################################
LOCAL_SERVER_VENV_PATH="$NASH_LOCAL_SERVER_DIR/.venv"
info "Creating virtual environment for Nash Local Server..."
rm -rf "$LOCAL_SERVER_VENV_PATH"
"$PYTHON_EXE" -m venv "$LOCAL_SERVER_VENV_PATH" || {
  error "Failed to create venv at $LOCAL_SERVER_VENV_PATH"
  exit 1
}
success "Virtual environment created at: $LOCAL_SERVER_VENV_PATH"

info "Upgrading pip, setuptools, wheel in the virtual environment..."
"$LOCAL_SERVER_VENV_PATH/bin/pip" install --upgrade pip setuptools wheel || {
  error "Failed to upgrade pip, setuptools, wheel in venv"
  exit 1
}
success "Upgraded pip, setuptools, wheel in the venv"

info "Installing Poetry in the Nash Local Server virtual environment..."
"$LOCAL_SERVER_VENV_PATH/bin/pip" install poetry || {
  error "Failed to install Poetry in venv"
  exit 1
}
success "Installed Poetry in the virtual environment"

info "Installing Nash Local Server project dependencies with Poetry..."
cd "$NASH_LOCAL_SERVER_DIR"
if [ -f "$NASH_LOCAL_SERVER_DIR/pyproject.toml" ]; then
  POETRY_VIRTUALENVS_CREATE=false "$VENV_PATH/bin/poetry" install --no-interaction --no-cache || {
    info "Poetry install encountered issues, trying alternative installation method..."
    if [ -f "$NASH_LOCAL_SERVER_DIR/requirements.txt" ]; then
      "$LOCAL_SERVER_VENV_PATH/bin/pip" install -r "$NASH_LOCAL_SERVER_DIR/requirements.txt" || {
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
  if [ -f "$NASH_LOCAL_SERVER_DIR/requirements.txt" ]; then
    "$LOCAL_SERVER_VENV_PATH/bin/pip" install -r "$NASH_LOCAL_SERVER_DIR/requirements.txt" || {
      error "Failed to install requirements from requirements.txt"
      exit 1
    }
    success "Installed dependencies from requirements.txt"
  else
    info "No dependency files found, continuing without installing additional dependencies"
  fi
fi

################################################################################
# 12. NASH LOCAL SERVER: Configuration
################################################################################
# Create environment file for local server
LOCAL_SERVER_ENV_FILE="$NASH_LOCAL_SERVER_DIR/.env"
info "Creating environment file for Nash Local Server at: $LOCAL_SERVER_ENV_FILE"
cat > "$LOCAL_SERVER_ENV_FILE" << EOL
# Nash Local Server Environment Variables
NASH_PATH=${NASH_MCP_DIR}
EOL
chmod 644 "$LOCAL_SERVER_ENV_FILE"  # User can read/write, others can read
success "Created environment file for Nash Local Server: $LOCAL_SERVER_ENV_FILE"

# Create run script for local server
RUN_LOCAL_SERVER_SCRIPT="$NASH_HOME_DIR/run_local_server.sh"
info "Creating run_local_server.sh script at: $RUN_LOCAL_SERVER_SCRIPT"
cat > "$RUN_LOCAL_SERVER_SCRIPT" << EOL
#!/bin/bash
source ~/Library/Application\ Support/Nash/nash-local-server-${NASH_LOCAL_SERVER_VERSION}/.venv/bin/activate
python ~/Library/Application\ Support/Nash/nash-local-server-${NASH_LOCAL_SERVER_VERSION}/src/nash_local_server/server.py
EOL
chmod +x "$RUN_LOCAL_SERVER_SCRIPT"
success "Created and made executable: $RUN_LOCAL_SERVER_SCRIPT"

################################################################################
# 13. INSTALLATION SUMMARY
################################################################################
info "=== Installation script finished at $(date) ==="
success "Nash MCP repository has been set up at: $NASH_MCP_DIR"
success "Nash Local Server repository has been set up at: $NASH_LOCAL_SERVER_DIR"
success "Python $TARGET_PYTHON_VERSION is installed"
info "MCP Virtual environment: $VENV_PATH"
info "Local Server Virtual environment: $LOCAL_SERVER_VENV_PATH"
info "You can run: \"$VENV_PATH/bin/python\" --version"
info "Log file: $LOG_FILE"
