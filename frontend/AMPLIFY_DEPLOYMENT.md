# Deploy the frontend with AWS Amplify

The repository contains the Vite frontend in `frontend/`. The root `amplify.yml`
builds that app and publishes its `dist/` directory. The backend is not included
in this Amplify build and must be deployed separately.

## Amplify Console setup

1. Connect the Git repository to Amplify Hosting and select the branch to deploy.
2. In the app's environment variables, set
   `AMPLIFY_MONOREPO_APP_ROOT` to `frontend`.
3. Set the frontend environment variables below for each branch/environment.
   Vite embeds these values at build time, so redeploy after changing them.
4. In **App settings > Rewrites and redirects**, add this SPA rewrite rule:

   | Source address | Target address | Type |
   | --- | --- | --- |
   | `/<*>` | `/index.html` | `200 (Rewrite)` |

   This lets client-side routes load when opened directly or refreshed.

## Required application environment variables

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | Public HTTPS backend API URL, including the version path, for example `https://api.example.com/api/v1`. |
| `VITE_SOCKET_URL` | Optional when Socket.IO uses the same backend origin. Otherwise, set the public HTTPS backend origin, for example `https://api.example.com` (no `/api/v1` path). If omitted, the frontend derives it from `VITE_API_BASE_URL`. |

Use the actual URLs of your deployed backend; the example domain is a
placeholder. The backend must allow requests from the Amplify site origin via
CORS and support Socket.IO connections. Do not put secrets in `VITE_*`
variables: they are included in the browser bundle.

## Build settings

The checked-in `amplify.yml` runs `npm ci` and `npm run build` from `frontend/`,
then publishes `frontend/dist/`. No custom build command is needed in the
Amplify Console.
