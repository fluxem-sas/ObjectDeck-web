# S3 Invoice Viewer

Mini app Next.js para inspeccionar facturas guardadas en un bucket S3 compatible con Railway.

## Uso

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

La app no usa base de datos y no guarda credenciales en disco. Los datos de conexión se envían a las API routes de Next solo para ejecutar cada petición.

## Datos esperados

- Access key
- Secret key
- Region
- Endpoint URL
- Bucket
- Prefix opcional, por ejemplo `bills`
- Force path style, normalmente activo para Railway/S3 compatible
