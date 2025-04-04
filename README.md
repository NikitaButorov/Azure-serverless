# Azure Container Apps - Бессерверное приложение

Пример бессерверного Node.js приложения для развертывания в Azure Container Apps.

## Локальный запуск

1. Установите зависимости:
   ```
   npm install
   ```

2. Запустите приложение:
   ```
   npm start
   ```

3. Проверьте работу приложения:
   - http://localhost:3000
   - http://localhost:3000/api/info

## Локальный запуск в Docker

1. Соберите Docker-образ:
   ```
   docker build -t azure-container-app:local .
   ```

2. Запустите контейнер:
   ```
   docker run -p 3000:3000 azure-container-app:local
   ```

## Развертывание в Azure Container Apps

### Подготовка ресурсов Azure

1. Создайте группу ресурсов:
   ```
   az group create --name myResourceGroup --location westeurope
   ```

2. Создайте Azure Container Registry:
   ```
   az acr create --resource-group myResourceGroup --name myAcrRegistry --sku Basic
   ```

3. Включите учетные данные администратора для ACR (важно для аутентификации):
   ```
   az acr update -n myAcrRegistry --admin-enabled true
   ```

4. Выполните вход в реестр:
   ```
   az acr login --name myAcrRegistry
   ```

5. Соберите и отправьте образ в реестр:
   ```
   docker build -t myacrregistry.azurecr.io/azure-container-app:latest .
   docker push myacrregistry.azurecr.io/azure-container-app:latest
   ```

6. Создайте окружение Container Apps:
   ```
   az containerapp env create \
     --name my-environment \
     --resource-group myResourceGroup \
     --location westeurope
   ```

7. Создайте Container App:
   ```
   az containerapp create \
     --name my-container-app \
     --resource-group myResourceGroup \
     --environment my-environment \
     --image myacrregistry.azurecr.io/azure-container-app:latest \
     --target-port 3000 \
     --ingress external \
     --min-replicas 0 \
     --max-replicas 10
   ```

### Настройка GitHub Actions для автоматического развертывания (обновленный метод)

Для решения проблем с аутентификацией, мы используем управляемую идентичность (Managed Identity) вместо прямой передачи учетных данных:

1. Создайте следующие секреты в репозитории GitHub:
   - `REGISTRY_NAME`: имя вашего ACR без домена (например, `myacrregistry`)
   - `IMAGE_NAME`: имя образа (например, `azure-container-app`)
   - `CONTAINER_APP_NAME`: имя вашего Container App (например, `my-container-app`)
   - `CONTAINER_APP_ENVIRONMENT`: имя окружения (например, `my-environment-env`)
   - `RESOURCE_GROUP`: имя группы ресурсов (например, `myResourceGroup`)

2. Создайте сервисный принципал с доступом contributor к вашей группе ресурсов:
   ```
   az ad sp create-for-rbac --name "myContainerAppGitHubAction" --role contributor \
     --scopes /subscriptions/<subscription-id>/resourceGroups/myResourceGroup \
     --sdk-auth
   ```

3. Сохраните вывод JSON в секрет GitHub с именем `AZURE_CREDENTIALS`

4. Обновленный workflow файл (.github/workflows/azure-container-apps.yml) автоматически:
   - Создаст управляемую идентичность
   - Настроит разрешения для доступа к ACR
   - Использует Azure CLI для сборки и отправки образа
   - Создаст или обновит Container App с использованием управляемой идентичности

5. Запустите workflow вручную через GitHub Actions или выполните push в ветку main.

## Преимущества использования управляемой идентичности

- Более безопасный подход без хранения паролей
- Упрощенное управление доступом через RBAC
- Централизованное управление разрешениями
- Автоматическое обновление токенов доступа

## Решение проблем с аутентификацией

Если вы столкнулись с ошибкой "UNAUTHORIZED: authentication required" при развертывании:

1. Убедитесь, что учетные данные администратора ACR включены:
   ```
   az acr update -n myAcrRegistry --admin-enabled true
   ```

2. Обновите учетные данные в GitHub Secrets:
   ```
   az acr credential show -n myAcrRegistry
   ```

3. Вы также можете вручную обновить конфигурацию Container App с правильными учетными данными:
   ```
   ACR_USERNAME=$(az acr credential show -n myAcrRegistry --query "username" -o tsv)
   ACR_PASSWORD=$(az acr credential show -n myAcrRegistry --query "passwords[0].value" -o tsv)

   az containerapp update \
     --name my-container-app \
     --resource-group myResourceGroup \
     --registry-server myacrregistry.azurecr.io \
     --registry-username $ACR_USERNAME \
     --registry-password $ACR_PASSWORD
   ```

4. Альтернативный подход - использование управляемой идентичности для доступа к ACR:
   ```
   # Создание управляемой идентичности
   az identity create --name container-app-identity --resource-group myResourceGroup

   # Получение ID идентичности
   IDENTITY_ID=$(az identity show --name container-app-identity --resource-group myResourceGroup --query id -o tsv)
   PRINCIPAL_ID=$(az identity show --name container-app-identity --resource-group myResourceGroup --query principalId -o tsv)

   # Обновление Container App
   az containerapp update \
     --name my-container-app \
     --resource-group myResourceGroup \
     --user-assigned $IDENTITY_ID

   # Предоставление доступа к ACR
   ACR_ID=$(az acr show --name myAcrRegistry --resource-group myResourceGroup --query id -o tsv)
   az role assignment create \
     --assignee $PRINCIPAL_ID \
     --role AcrPull \
     --scope $ACR_ID
   ```

## Решение проблемы с ACR Tasks

Если вы столкнулись с ошибкой "TasksOperationsNotAllowed" при использовании `az acr build`:

1. Это означает, что функционал ACR Tasks недоступен для вашего регистра. Обычно эта ошибка возникает из-за ограничений на плане Basic или в пробных подписках.

2. Вместо ACR Tasks можно использовать стандартные команды Docker:

   ```bash
   # Получение учетных данных ACR
   ACR_USERNAME=$(az acr credential show -n myAcrRegistry --query "username" -o tsv)
   ACR_PASSWORD=$(az acr credential show -n myAcrRegistry --query "passwords[0].value" -o tsv)
   
   # Логин в Docker
   docker login myacrregistry.azurecr.io -u $ACR_USERNAME -p $ACR_PASSWORD
   
   # Сборка и публикация образа
   docker build -t myacrregistry.azurecr.io/my-image:latest .
   docker push myacrregistry.azurecr.io/my-image:latest
   ```

3. В GitHub Actions workflow используйте `docker/login-action` и `docker/build-push-action` вместо `az acr build`:

   ```yaml
   - name: Get ACR credentials
     run: |
       ACR_USERNAME=$(az acr credential show -n ${{ secrets.REGISTRY_NAME }} --query "username" -o tsv)
       ACR_PASSWORD=$(az acr credential show -n ${{ secrets.REGISTRY_NAME }} --query "passwords[0].value" -o tsv)
       echo "ACR_USERNAME=$ACR_USERNAME" >> $GITHUB_ENV
       echo "ACR_PASSWORD=$ACR_PASSWORD" >> $GITHUB_ENV

   - name: Docker login to ACR
     uses: docker/login-action@v2
     with:
       registry: ${{ secrets.REGISTRY_NAME }}.azurecr.io
       username: ${{ env.ACR_USERNAME }}
       password: ${{ env.ACR_PASSWORD }}

   - name: Build and push Docker image
     uses: docker/build-push-action@v4
     with:
       push: true
       tags: ${{ secrets.REGISTRY_NAME }}.azurecr.io/${{ secrets.IMAGE_NAME }}:${{ github.sha }}
       file: ./Dockerfile
   ```

## Преимущества бессерверного исполнения

- Автоматическое масштабирование до нуля (минимум 0 реплик) - вы не платите, когда нет трафика
- Масштабирование вверх при увеличении нагрузки (до 10 реплик)
- Оплата только за фактическое использование ресурсов 