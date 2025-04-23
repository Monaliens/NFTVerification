FROM node:18-alpine

WORKDIR /app

# Ana proje bağımlılıklarını kur
COPY package*.json ./
RUN npm install

# Proje dosyalarını kopyala
COPY . .

# Frontend klasörüne git ve oradaki uygulamayı başlat
WORKDIR /app/NFTVerification

# Frontend bağımlılıklarını kur
RUN if [ -f "package.json" ]; then \
    npm install && \
    (if grep -q '"build"' package.json; then npm run build; else echo "No build script found"; fi) \
    ; fi

# Uygulamayı başlat
EXPOSE 3002

# Frontend uygulamasını başlat
CMD if [ -d "build" ]; then \
      npx serve -s build -l 3002; \
    elif grep -q '"start"' package.json; then \
      npm start; \
    else \
      npx serve -l 3002; \
    fi 