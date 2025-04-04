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

### Настройка GitHub Actions для автоматического развертывания

1. Получите учетные данные для Azure Container Registry:
   ```
   az acr credential show --name myAcrRegistry
   ```

2. Создайте следующие секреты в репозитории GitHub:
   - `REGISTRY_LOGIN_SERVER`: URL вашего ACR (например, myacrregistry.azurecr.io)
   - `REGISTRY_USERNAME`: имя пользователя ACR
   - `REGISTRY_PASSWORD`: пароль ACR
   - `IMAGE_NAME`: имя образа (например, azure-container-app)
   - `CONTAINER_APP_NAME`: имя вашего Container App (например, my-container-app)
   - `RESOURCE_GROUP`: имя группы ресурсов (например, myResourceGroup)

3. Создайте сервисный принципал для доступа GitHub Actions к Azure:
   ```
   az ad sp create-for-rbac --name "myContainerAppGitHubAction" --role contributor \
     --scopes /subscriptions/<subscription-id>/resourceGroups/myResourceGroup \
     --sdk-auth
   ```

4. Сохраните вывод JSON в секрет GitHub с именем `AZURE_CREDENTIALS`

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

## Преимущества бессерверного исполнения

- Автоматическое масштабирование до нуля (минимум 0 реплик) - вы не платите, когда нет трафика
- Масштабирование вверх при увеличении нагрузки (до 10 реплик)
- Оплата только за фактическое использование ресурсов 