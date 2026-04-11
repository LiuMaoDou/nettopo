.PHONY: dev-frontend dev-backend dev install

dev-frontend:
	cd frontend && pnpm dev

dev-backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

dev:
	$(MAKE) -j2 dev-frontend dev-backend

install:
	cd frontend && pnpm install
	cd backend && uv pip install -r requirements.txt
