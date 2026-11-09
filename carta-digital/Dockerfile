# 1. Imagen base oficial de Node.js (versión ligera)
FROM node:18-alpine

# 2. Crear y definir el directorio de trabajo dentro del contenedor
WORKDIR /app

# 3. Copiar manifest de dependencias primero (aprovecha la caché de Docker)
COPY package*.json ./

# 4. Instalar dependencias del proyecto
RUN npm install --production

# 5. Copiar todo el código fuente del proyecto
COPY . .

# 6. Exponer el puerto donde corre la app (ajustar si tu compañero usa otro)
EXPOSE 3000

# 7. Comando para iniciar la aplicación Node.js
CMD ["node", "index.js"]

