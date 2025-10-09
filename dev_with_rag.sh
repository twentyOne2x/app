#!/usr/bin/env bash

# Launch the RAG FastAPI backend and the Next.js frontend together for local testing.
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/home/user/PycharmProjects/rag}"
FRONTEND_DIR="${FRONTEND_DIR:-/home/user/PycharmProjects/app}"
BACKEND_APP="${BACKEND_APP:-rag_v2.app:app}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
APP_ORIGINS="${APP_ORIGINS:-http://localhost:${FRONTEND_PORT}}"
NEXT_PUBLIC_RAG_API_URL="${NEXT_PUBLIC_RAG_API_URL:-http://localhost:${BACKEND_PORT}}"
PYTHON_BIN="${PYTHON_BIN:-python}"
BACKEND_VENV="${BACKEND_VENV:-}"
NODE_BIN="${NODE_BIN:-node}"
REQUIRED_NODE_MAJOR=18

if ! command -v "${NODE_BIN}" >/dev/null 2>&1; then
  echo "❌ Node.js is not installed or not on PATH. Install Node ${REQUIRED_NODE_MAJOR}.x and try again."
  exit 1
fi

NODE_VERSION_STR="$("${NODE_BIN}" --version 2>/dev/null || true)"
NODE_VERSION_STR="${NODE_VERSION_STR#v}"
NODE_MAJOR="${NODE_VERSION_STR%%.*}"
if [[ -z "${NODE_MAJOR}" || "${NODE_MAJOR}" -lt "${REQUIRED_NODE_MAJOR}" ]]; then
  echo "❌ Detected Node '${NODE_VERSION_STR:-unknown}'. Please install Node ${REQUIRED_NODE_MAJOR}.x."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "❌ pnpm is not installed. Install it (https://pnpm.io/installation) before running this script."
  exit 1
fi

if [[ ! -f "${FRONTEND_DIR}/package.json" ]]; then
  echo "❌ Could not find package.json in ${FRONTEND_DIR}. Check FRONTEND_DIR."
  exit 1
fi

echo "🧩 Ensuring frontend dependencies are installed..."
(
  cd "${FRONTEND_DIR}" || exit 1
  if [[ "${FORCE_PNPM_INSTALL:-0}" == "1" ]]; then
    echo "📦 FORCE_PNPM_INSTALL=1 -> running pnpm install..."
    pnpm install
  elif [[ ! -d node_modules ]]; then
    echo "📦 node_modules missing -> running pnpm install..."
    pnpm install
  else
    echo "✅ node_modules present. Skip install (set FORCE_PNPM_INSTALL=1 to reinstall)."
  fi
)

cleanup() {
  echo ""
  echo "🛑 Stopping local stack..."
  [[ -n "${FRONT_PID:-}" ]] && kill "${FRONT_PID}" 2>/dev/null || true
  [[ -n "${BACK_PID:-}" ]] && kill "${BACK_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

activate_venv() {
  if [[ -n "$BACKEND_VENV" ]]; then
    if [[ ! -d "$BACKEND_VENV" ]]; then
      echo "❌ BACKEND_VENV is set to '$BACKEND_VENV' but that directory does not exist."
      exit 1
    fi
    # shellcheck disable=SC1090
    source "${BACKEND_VENV}/bin/activate"
  elif [[ -d "${BACKEND_DIR}/.venv" ]]; then
    # shellcheck disable=SC1090
    source "${BACKEND_DIR}/.venv/bin/activate"
  fi
}

echo "⚙️  Preparing Python environment..."
activate_venv

if ! "${PYTHON_BIN}" -c "import uvicorn" >/dev/null 2>&1; then
  echo "ℹ️  uvicorn not found in the current environment. Installing..."
  "${PYTHON_BIN}" -m pip install --quiet uvicorn
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "⚠️  OPENAI_API_KEY is not set. The backend will not be able to call OpenAI APIs."
fi

echo "🚀 Starting FastAPI backend on port ${BACKEND_PORT}..."
(
  cd "${BACKEND_DIR}" || exit 1
  export PYTHONPATH="${BACKEND_DIR}/src:${PYTHONPATH:-}"
  export APP_ORIGINS
  exec "${PYTHON_BIN}" -m uvicorn "${BACKEND_APP}" \
    --reload \
    --host 127.0.0.1 \
    --port "${BACKEND_PORT}"
) &
BACK_PID=$!

echo "🌐 Starting Next.js frontend on port ${FRONTEND_PORT}..."
(
  cd "${FRONTEND_DIR}" || exit 1
  export NEXT_PUBLIC_RAG_API_URL
  exec pnpm dev -- --port "${FRONTEND_PORT}"
) &
FRONT_PID=$!

echo ""
echo "✅ Local stack is starting up."
echo "   Backend:   http://localhost:${BACKEND_PORT} (health check at /healthz)"
echo "   Frontend:  http://localhost:${FRONTEND_PORT}"
echo ""
echo "Press Ctrl+C to stop both processes."

wait
