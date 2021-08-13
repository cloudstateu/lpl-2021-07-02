# PoC Multiline Logs

---

## Zalozenia

- [X] Aplikacja napisana jest w JS (Express.js)
- [X] Aplikacja jest skonteneryzowana
- [X] Aplikacja posiada dwa endpoint: `/ok` oraz `/error`
- [X] Oba endpoint logują informacje o przychodzącym requescie. Logowanie odbywa się na stdout
- [X] Endpoint `/error` zwraca wyjatek `Expected error`
- [X] Wyjątki łapane są przez middleware Express.js i logowane na stdout (wraz ze stacktrace w postaci wieloliniowego logu)
- [X] Obraz kontenera udostępniony jest na publicznie dostępnyn ACR
- [X] Aplikacja uruchomiona jest na klastrze Kubernetes
- [X] Na klastrze Kubernetes zainstalowany jest EFK, który odczytuje logi wypisywane na stdout (w tym logi aplikacji)
- [X] W Kibana wieloliniowe logi są wyświetlane jako jeden wpis

---

W wyniku testów doszliśmy do wniosku, ze najwygodniejszym sposobem logowania wielolinijkowych wiadomosci jest wypisywanie ich z aplikacji w postaci JSON. Metoda ta dziala bezeproblemowo i jest latwa do skonfigurowania na kazdym środowisku.

Wielolinijkowe logi tekstowe, o ile mozliwe do odczytywania, powodują duze problemy na poziomie konfiguracji i są zawodne.

---

## Uruchomienie aplikacji

W celu lokalnego uruchomienia aplikacji w folderze `/app` wywołaj komendę:

```bash
npm start
```

W celu zbudowania obrazu kontenera wywołaj komendę:

```bash
docker build -t lb-multiline-logs . 
```

W celu uruchomienia aplikacji z obrazu kontenera wywołaj komendę:

```bash
npm run docker
```

## Udostępnienie aplikacji w ACR i uruchomienie na Kubernetes

```bash
az acr create -n acrdev$RANDOM -g aks-dev --sku Basic --admin-enabled true
az acr credential show -n <nazwa_ACR>
az acr build -t <nazwa_ACR>.azureio.cr/lb-multiline-logs:latest -r <nazwa_ACR> .
az acr repository list --name <nazwa_ACR>
az acr repository show-tags --name acrdev22441 --repository lb-multiline-logs
kubectl create secret docker-registry dockerregistrycredential --docker-server=<nazwa_ACR>.azurecr.io --docker-username=<nazwa_ACR> --docker-password=<password>
kubectl apply -f deployment/lb-multiline-logs.yaml # zmien adres ACR w pliku
```

## Przetestowanie aplikacji na Kuberenets

```bash
kubectl get svc
kubectl run -it debug --image=nginx --rm=true -- sh # tymczasowy pod do debugu
```

Będąc podłączonym do shell poda:

```
curl lb-multiline-logs-svc:8080/ok
curl lb-multiline-logs-svc:8080/error
```

Wyloguj się z poda `debug` i sprawdź logi poda:

```bash
kubectl logs -l app=lb-multiline-logs --tail=100
```

Logi powinny wygladac następująco:

```bash
> app@1.0.0 start
> node index.js

Running on http://localhost:8080
{"time":"2021-08-03T09:28:41.297+02:00","requestId":"c4d3a81b-2465-431c-9793-5ab83248389d","level":"INFO","namespace":"index.js","message":"Received request /ok."}
{"time":"2021-08-03T09:28:44.223+02:00","requestId":"bfe01698-c47b-469d-8858-b300d5c1dd1f","level":"INFO","namespace":"index.js","message":"Received request /error. This will cause an error."}
{"time":"2021-08-03T09:28:44.224+02:00","requestId":"bfe01698-c47b-469d-8858-b300d5c1dd1f","level":"ERROR","namespace":"index.js","message":"Error: Expected error!\n    at /Users/macborowy/chm/test/poc-multiline-logs/app/index.js:20:9\n    at Layer.handle [as handle_request] (/Users/macborowy/chm/test/poc-multiline-logs/app/node_modules/express/lib/router/layer.js:95:5)\n    at next (/Users/macborowy/chm/test/poc-multiline-logs/app/node_modules/express/lib/router/route.js:137:13)\n    at Route.dispatch (/Users/macborowy/chm/test/poc-multiline-logs/app/node_modules/express/lib/router/route.js:112:3)\n    at Layer.handle [as handle_request] (/Users/macborowy/chm/test/poc-multiline-logs/app/node_modules/express/lib/router/layer.js:95:5)\n    at /Users/macborowy/chm/test/poc-multiline-logs/app/node_modules/express/lib/router/index.js:281:22\n    at Function.process_params (/Users/macborowy/chm/test/poc-multiline-logs/app/node_modules/express/lib/router/index.js:335:12)\n    at next (/Users/macborowy/chm/test/poc-multiline-logs/app/node_modules/express/lib/router/index.js:275:10)\n    at /Users/macborowy/chm/test/poc-multiline-logs/app/node_modules/express-request-id/index.js:17:9\n    at Layer.handle [as handle_request] (/Users/macborowy/chm/test/poc-multiline-logs/app/node_modules/express/lib/router/layer.js:95:5)"}
```

## Instalacja EFK

Elasticsearch ma spore wymagania co do zasobów sam w sobie. Najlepiej, żeby Twój klaster miał przynajmniej 3 Node (6+ CPU, 10GB+ RAM)

### Skalowanie klastra

1. Znajdź nazwę swojej Azure Agent Pool

  ```shell
  az aks show -g <Resource_Group> -n <AKS_name> --query agentPoolProfiles
  ```
    
1. Zmień liczbę Node w agentPool
  
  ```shell
  az aks scale \
    -g <Resource_Group> -n <AKS_name> \
    --node-count 3 \
    --nodepool-name <Agent_Pool_name>
  ```

### Instalacja EFK

1. Sprawdź czy masz zainstalowany Helm: 

  ```shell
  helm version
  ```

1. Dodaj repozytorium Helm Chart od Bitnami: 

  ```shell
  helm repo add bitnami https://charts.bitnami.com/bitnami
  ```

1. Sprawdź Helm Chart dostępne w repozytorium Bitnami: 

  ```shell
  helm serach repo bitami
  ```

1. Utwórz namespace dla narzędzi związanych z logowaniem: 

  ```shell
  kubectl create ns logging
  ```

1. Zainstaluj Elasticsearch (instalacja trwa 6-7 minut):
    
  ```shell
  helm install my-elasticsearch bitnami/elasticsearch -n logging \
    --set master.replicas=1 \
    --set coordinating.replicas=1 \
    --set data.replicas=1 \
    --set ingest.replicas=1
  ```

1. Sprawdź zainstalowane komponenty (upewnij się, że Pod zostały poprawnie uruchomione (poza Podami z nazwą `coordinating-only`))

  ```shell
  kubectl get all -n logging
  ```

1. Zainstaluj Kibana

  ```shell
  helm install my-kibana bitnami/kibana -n logging \
    --set elasticsearch.enabled=false \
    --set elasticsearch.hosts[0]=my-elasticsearch-coordinating-only \
    --set elasticsearch.port=9200 \
    --set service.type=LoadBalancer
  ```

1. Zainstaluj FluentD

  Zwróć uwagę, ze w komendzie zmieniasz nazwe uzywanego przez FluentD Config Map. W tym kroku zmieniasz Config Map dla komponentu _Aggregator_ (pochodzi ze Stateful Set). Config Map przechowuje zawartosc pliku `fluentd.conf`.

  ```shell
  helm install my-fluentd bitnami/fluentd -n logging \
    --set aggregator.configMap=fluentd-aggregator \
    --set aggregator.extraEnv[0].name=ELASTICSEARCH_HOST \
    --set aggregator.extraEnv[0].value=my-elasticsearch-coordinating-only \
    --set aggregator.extraEnv[1].name=ELASTICSEARCH_PORT \
    --set-string aggregator.extraEnv[1].value=9200
  ```

1. Zmień Config Map dla komponentu _Forwarder_

   Config Map dla tego komponentu będzie wygenerowana automatycznie przez FluentD, poniewaz jej nie przeciazylismy podczas instalacji Helm. Mozesz to sprawdzic listujac Config Map w namespace K8s w ktorym zainstalowany jest FluentD.

   Zaktualizowana Config Map znajduje sie w pliku `fluentd-forwarder-cm.yaml`. Przed wdrozeniem jej na klaster upewnij sie, ze jej nazwa jest poprawna i nadpisze Config Map dla Forwarder, ktora zostala automatycznie utworzona podczas instalcji FluentD.

   Forwarder zbiera tylko logi dla Podow `lb-multiline-logs` (w celu zmniejszenia liczby logów w Kibana). W przypadku uruchomienia podanej w tym przykladzie konfiguracji FluentD powinno to byc skonfigurowane niezaleznie.

   Sam FluentD zostal skonfigurowany, zeby wypisywal wlasne logi na poziomie debug w celu ulatwienia konfigurowania narzedzia. Na innych srodowiskach wartosc ta moze zostac zmieniona na wyzszą.

   Często podczas wielu zmian w konfiguracji FluentD dobrze jest restartować wszystkie Pody FluentD, Elasticsearch oraz Kibana. Chodzi o uzyskanie pewnosci, ze wszystkie komponenty dzialają z poprawną konfiguracją. Dodatkowo, jeśli w czasie konfigurwoania narzedzia zostanie zmieniony format logu generowanego przez aplikacje dobrze jest usunąć stare wpisy z bazy danych Elasticsearch za pomoca komendy:

   ```bash
   curl -XDELETE <ES-HOST>:<ES-PORT>/<INDICE_NAME>
   ```

## Uruchomienie Kibana

1. Kibana została zainstalowana jako Service typu LoadBalancer, wiec jest dostepna publicznie. Uruchom ją w przegladarce.
1. Wykonaj kilka zapytan do aplikacji `lb-multiline-logs` w celu wygenerowania kilku wpisów w logu
1. Skonfiguruj Index w Kibana
1. Sprawdź czy w Kibana widzisz logi z aplikacji `lb-multiline-logs`.

