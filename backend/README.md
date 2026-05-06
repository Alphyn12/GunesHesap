# Solar Rota Python Backend

Local-first FastAPI service for the hybrid Solar Rota architecture.

Install dependencies:

```powershell
python -m pip install -r backend/requirements.txt
```

Run locally:

```powershell
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Health check:

```powershell
python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"
```

Endpoints:

- `GET /health`
- `POST /api/pv/calculate`
- `POST /api/pvlib/calculate`
- `POST /api/financial/proposal`

The backend contains a real pvlib-backed MVP path. When `pvlib` is installed and the request has coordinates plus installed capacity, it uses pvlib solar position, clear-sky irradiance, POA transposition, cell temperature, and PVWatts DC calculations with a simplified AC/inverter approximation.

If `pvlib` is missing or the pvlib path fails, the backend returns an explicit deterministic fallback response with fallback metadata while preserving the normalized contract.

Known MVP limits:

- Uses clear-sky irradiance scaled to the request GHI when no measured/PVGIS hourly weather source is provided.
- Uses constant-efficiency inverter approximation with a basic AC cap.
- AOI losses, detailed clipping curves, battery dispatch, off-grid autonomy, and irrigation pump curves are future engineering layers.
