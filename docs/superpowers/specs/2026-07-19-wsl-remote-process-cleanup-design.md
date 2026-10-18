# Deterministische Rückgewinnung von WSL-Remote-Prozessen – Design

> **Hinweis zur historischen Grenze**: Als dieses Dokument entstand, war WSL noch ein dedizierter Host pro
> Sitzung; heute ist WSL nach `window + normalized(distro,user)` gepoolt, und Workspace-Freigabe,
> 60-Sekunden-Idle-TTL sowie App-Shutdown richten sich nach
> `docs/superpowers/specs/2026-07-20-window-scoped-wsl-host-pooling-design.md`. Der begrenzte Exit,
> die idempotente Bereinigung und der Schutz vor Waisen-Prozessen dieses Dokuments gelten weiterhin,
> die Host-Anzahl von WSL darf aber nicht mehr als pro-Sitzung interpretiert werden.

## Hintergrund

Der WSL-Remote-Workspace nutzt derzeit die gemeinsame `IRemoteBackend` / `connectRemote` / Desktop-Host-Kette.
Die Hauptverbindung von WSL ist ein von der Desktop-Host gestarteter
`wsl.exe -- bash -lc "...zcode-server..."`-stdio-Subprozess; die normale Freigabe hängt davon ab, dass der
Client stdin schließt, woraufhin `zcode-server` innerhalb von WSL nach dem EOF den von ihm verwalteten
ZCode Agent freigibt.

Es gab bereits per-Sitzungs-, pro-Fenster- und Host-interne Ressourcenfreigabe, aber beim Beenden der
Anwendung wurde nur auf Local Hosts in `windowHostProcessMap` gewartet. Die damaligen dedizierten
WSL-/Docker-/Server-Hosts, der fenstergemeinsame SSH-Host und die Bot-Remote-Runtime wurden separat vom
Remote-Session-Manager gehalten und erhielten beim Schließen des Fensters ein Dispose, wurden aber nicht
einheitlich bei App-Quit oder Update-Installation erwartet. Gleichzeitig konnte ein hängendes Remote-stdio-Shutdown
beim RPC-Stop nach Ablauf des Gesamt-Deadlines direkt beenden und thereby das Dispose des Agent überspringen;
auch der `disconnect`-Pfad hatte keine begrenzte finale Exit-Garantie.

So entstand eine Lücke zwischen „Freigabe eingeleitet“ und „alle ZCode-eigenen Remote-Prozesse sind beendet“.
Wenn der Hauptprozess frühzeitig endet, das Host-Cleanup festhängt oder eine alte Version unerwartet
abstürzt, können losgelöste `zcode-cli`-Prozesse innerhalb von WSL von PID 1 übernommen werden und
lange zurückbleiben.

## Ziele

- Bei echtem Schließen des Fensters, Beenden der App oder Installieren eines Updates werden die vom
  jeweiligen Owner gehaltenen Remote Hosts, das WSL-`zcode-server` und die ZCode Agents deterministisch
  zurückgewonnen.
- App-Quit / Update-Installation warten innerhalb eines begrenzten Zeitfensters auf Local Hosts und alle
  Remote Hosts; bei Timeout bleibt ein eindeutiges Log und es erfolgt ein Fallback auf Prozessebene.
- Ein RPC-Stop-Timeout darf nicht verhindern, dass das Agent-Cleanup versucht wird.
- Die Einstiegspunkte für disconnect / Signal / Dispose in main und Host laufen in derselben idempotenten
  Freigabe-Zustandsmaschine zusammen.
- Für neu gestartete WSL-ZCode-Prozesse wird eine Owner-Identität hinterlassen, damit spätere Starts
  verwaiste Prozesse mit „Owner ist verstorben“ sicher erkennen können; kein globales Scannen nach
  Prozessnamen und kein versehentliches Abschließen.
- Die Semantik von Desktop `desktop-continuous`, Mobile `web-remote-replayable`, owner/lease,
  CommandInbox und workspace identity bleibt unverändert.

## Nicht-Ziele

- Kein Aufruf von `wsl --terminate` oder `wsl --shutdown`. Die WSL-Distribution ist eine vom Benutzer
  geteilte Umgebung und gehört keiner einzelnen ZCode-Sitzung.
- Kein Zerstören von Host/Agent bei Trennung vom Telefon, Neuaufbau der Web-Bridge, Renderer-Reload,
  Minimieren des Fensters oder Minimieren in den Tray.
- Keine Bereinigung beliebiger `node`-, `zcode-cli`- oder Benutzer-Shell-Prozesse, deren Zugehörigkeit zu
  ZCode nicht nachgewiesen werden kann.
- Keine Änderung der fenstergemeinsamen SSH-Host-Strategie und kein Umstellen von WSL/Docker auf einen
  gemeinsam genutzten Host.
- Kein Absenken von task/session/queue/snapshot-Zustand in desktop main, relay oder ein Cleanup-Registry.

## Zeitpunkte der Rückgewinnung

| Ereignis | Rückgewinnung | Umfang | Grund |
| --- | --- | --- | --- |
| Schließen eines echten BrowserWindow | Ja | Local Host des Fensters, dedizierte Sessions, gemeinsame SSH Hosts, Bot Runtimes | Der Fenster-Owner ist beendet |
| Schließen über die Windows-Schaltfläche minimiert in den Tray | Nein | keiner | Fenster und laufende Aufgaben leben weiter |
| Fenster minimieren | Nein | keiner | Nur Sichtbarkeitsänderung |
| Renderer-Reload / Crash-Recovery | Nein | nur alter Attachment | Host/CLI-Lebenszyklus gehört zum Fenster, nicht zum Renderer |
| Trennung von `/remote` auf dem Telefon oder Bridge-Dispose | Nein | nur mobiler Attachment | Ein Shared-Host-Attachment besitzt keine Runtime |
| `before-quit` / Cmd+Q / Tray-„Beenden“ | Ja und warten | alle Local/Remote Hosts der App | Der App-Owner ist beendet |
| Vor der Installation eines Auto-Updates | Ja und warten | alle Local/Remote Hosts der App | Erst nach Freigabe von Prozessen, Dateien und Runtime-Locks wird das Update übergeben |
| Unerwartetes Schließen der Remote-Verbindung eines Hosts | Ja | Services, Attachments, Agent und Backend des aktuellen Hosts | Die Fehlerdomäne des Hosts ist beendet |
| Main/Host-IPC-Disconnect | Ja, begrenzt | alle Ressourcen des aktuellen Hosts | Der übergeordnete Owner ist verschwunden |

## Lebenszyklus-Zustandsmaschine

### App-Ebene

```text
RUNNING
  |
  | app-before-quit / update-install
  v
PREPARING_SHUTDOWN
  |-- mark force quit, Logik zum Minimieren in den Tray darf nicht erneut übernehmen
  |-- cron / telemetry / neue Remote-Session-Admission stoppen
  |-- Local Host + Remote Host Owners snapshotten
  |-- ausstehende Remote-Verbindungen abbrechen
  |-- disposeAndWait(alle eindeutigen Hosts) parallel
  v
HOSTS_SETTLED
  |-- alle beendet: normal
  |-- Deadline: verbleibende Host-Labels/PIDs exakt protokollieren und Fallback erzwingen
  v
EXIT_OR_UPDATE_HANDOFF
```

### Innerhalb eines Remote Hosts

```text
ACTIVE
  |
  | Dispose durch Parent / SIGTERM / SIGINT / disconnect / Schließen der Remote-Verbindung
  v
DISPOSING (single-flight)
  |-- keine neuen Attachments/RPCs mehr annehmen
  |-- owned attachment scopes schließen
  |-- lokale Services und Agent-Prozesse freigeben
  |-- stdin von remoteConnection schließen
  |-- auf das Schließen des Remote-Server-Streams warten
  v
EXITED

Deadline überschritten
  -> aktuelle Phase protokollieren
  -> verbleibendes Best-Effort-Cleanup ausführen
  -> process.exit(nicht-null bei unerwartet/Timeout)
```

### WSL-Remote-Server

```text
stdin EOF / Fehler / Terminationssignal
  |
  v
stopRpc (unabhängig begrenzt)
  |
  +-- Erfolg ---------------------+
  +-- Timeout/Fehler -> Log ------+
                                  v
                         dispose Services/Agent
                         (immer versucht, begrenzt)
                                  |
                                  v
                              process.exit
```

RPC-Stop und Service-Dispose verwenden unabhängige Phasen-Deadlines. Es darf nicht erneut ein einziger
sequenzieller Gesamt-Deadline dazu führen, dass das Dispose des Agent vollständig übersprungen wird,
solange `stopRpc` aussteht.

## Komponentendesign

### 1. Der Remote-Session-Manager wird zur Wahrheitsquelle für den Lebenszyklus des Remote Hosts

`createRemoteWorkspaceSessionManager` erhält einen neuen app-weiten asynchronen Einstiegspunkt:

```ts
disposeAllAndWaitForAppShutdown(reason: string): Promise<RemoteHostDisposeSummary>
```

Beim Aufruf wird synchron abgeschlossen:

1. Das Erstellen neuer Remote-Sessions / Bot Runtimes wird verhindert.
2. Alle ausstehenden SSH-Verbindungen werden abgebrochen und ihre Promises abgelehnt.
3. Aus `remoteWorkspaceSessionsById`, `sshHostsByPoolKey` und
   `windowBotRemoteRuntimeProcessMap` werden alle eindeutigen Host-Prozesse gesnapshottet.
4. Zuerst werden die entsprechenden Registries geleert oder markiert, damit spätere `closed`-Callbacks des
   Fensters und `exit`-Callbacks des Hosts idempotent bleiben.
5. Das injizierte `disposeHostProcessAndWait` wird parallel aufgerufen und liefert für jeden Host das
   Ergebnis exited/timed-out.

Die vollständige Host-Map des Process Monitor wird weiterhin für Anzeige und Diagnose verwendet, ist aber
keine Wahrheitsquelle für die fachliche Freigabe. Sie kennt ausstehende Verbindungen, logische Sessions,
SSH-Pool-Ownership und Bot-Runtime-Beziehungen nicht und kann den Session-Manager nicht ersetzen.

### 2. App-Quit und Update-Installation teilen sich dieselbe Shutdown-Barriere

Es wird eine app-weite Host-Barriere extrahiert, die gleichzeitig abdeckt:

- `prepareAppQuit`
- `prepareWindowsProcessesForUpdateInstall`

Die Barriere wartet parallel auf:

- Local Hosts in `windowHostProcessMap`
- die dedizierten/gemeinsamen/Bot-Hosts, die der Remote-Session-Manager zurückgibt

Host-Prozesse werden nach Objekt dedupliziert. Ein erneutes Eintreten gibt dieselbe laufende Promise zurück;
wenn nach der Update-Vorbereinigung `before-quit` ausgelöst wird, darf kein weiterer Timer erzeugt und das
erste Ergebnis nicht überschrieben werden.

Das Schließen des Fensters führt weiterhin das bestehende Dispose pro Fenster aus und bleibt der normale
Einstiegspunkt des Fenster-Lebenszyklus; die App-Barriere ist die app-weite Wartezeit und Ausnahmekompensation
und ersetzt die Semantik pro Fenster nicht.

### 3. Host-Shutdown verwendet einen begrenzten Single-Flight

`disposeHostResources(reason)` bleibt die einzige asynchrone Freigabefunktion, erhält aber zusätzlich
Phase-/Deadline-Aufzeichnung:

- Zuerst werden synchron die Attachment- und neuen RPC-Einstiegspunkte versperrt.
- Service-Dispose und Dispose der Remote-Verbindung müssen beide versucht werden; ein Fehlschlag der
  vorherigen Phase darf die nächste nicht überspringen.
- `disconnect` wartet wie SIGTERM/SIGINT auf das begrenzte Cleanup und beendet sich dann ausdrücklich.
- Der `exit`-Handler führt nur synchrones Best-Effort aus und trägt nicht das normale asynchrone Cleanup.

Ein normales Dispose durch den Parent verwendet Exit-Code 0; unerwartetes Schließen der Remote-Verbindung,
Timeout beim disconnect-Cleanup oder fehlgeschlagenes Cleanup verwenden einen Exit-Code ungleich null und
behalten reason/phase/elapsedMs im Log.

### 4. RemoteConnection liefert eine wartbare Schließ-Zusage

`RemoteConnection` erhält ein idempotentes `disposeAndWait()`:

1. Synchron werden Client/Protokoll/Socket gestoppt und das stdin des Haupt-Streams geschlossen.
2. Es wird auf `StdioStream.onClose` des Haupt-Streams gewartet.
3. Nach Ablauf der Grace-Period des Remote-Servers wird der Backend-Fallback-Dispose aufgerufen.
4. Das Ergebnis exited/timed-out wird für das Host-Log und die Entscheidungen der übergeordneten Ebene
   zurückgegeben.

Das bestehende synchrone `dispose()` bleibt aus Kompatibilitätsgründen erhalten und löst intern denselben
Single-Flight aus, aber der normale Host-Freigabepfad muss `disposeAndWait()` erwarten (await).

Bei einem Fehler während des Verbindungsaufbaus muss ebenfalls das Backend freigegeben werden; der Besitz
des Cleanups darf nicht erst nach dem erfolgreichen Zurückgeben einer `RemoteConnection` entstehen.

### 5. WSLBackend verfolgt nur selbst gestartete Subprozesse

Das WSL-Backend verwaltet die über `spawn` / `execFile` gestarteten und noch nicht beendeten
Windows-Child-Handles:

- Nach `exit/close/error` des Child wird der Eintrag sofort aus dem Registry entfernt.
- Der Backend-Fallback-Dispose schließt nur diese Handles, enumeriert keine Systemprozesse und beendet
  keine Distribution.
- Der Haupt-Server-Stream wird bevorzugt durch stdin-EOF normal beendet; der Child-Kill dient nur nach
  Ablauf der Grace-Period als Fallback.
- Kurze Befehle wie upload/detect/deploy können bei abgebrochener Verbindung oder Backend-Dispose ebenfalls
  abgebrochen werden, damit in der fehlgeschlagenen Verbindungsphase keine Reste bleiben.

Das Docker-Backend behält dieselbe Interface-Semantik; das SSH-Backend schließt weiterhin die
ssh2-Verbindung; Server-Remote nutzt seinen WebSocket-Schließvertrag und tritt nicht in das WSL-Child-Registry ein.

### 6. Owner-Kennzeichnung und sichere Waisen-Rückgewinnung

Jeder Start eines Remote-Servers erzeugt eine nicht wiederverwendbare `ownerId` und protokolliert:

- Owner-Art: `desktop-attached-remote`
- Remote-Art / Distribution
- Desktop-Host-Owner-Token
- Server-PID und Startzeit des Linux-Prozesses
- von diesem Server gestartete Agent-PIDs und Prozess-Startzeiten

Das Registry liegt im eigenen `~/.zcode/server/owners/` des WSL-Benutzers und wird atomar geschrieben; es
liegt nicht in desktop main, relay oder im Task-Repository. Bei normalem Exit wird der Registry-Eintrag
gelöscht.

Beim nächsten Start des WSL-Remote-Servers durch denselben Benutzer werden nur Einträge zurückgewonnen,
die gleichzeitig folgende Bedingungen erfüllen:

1. Registry-Schema, Owner-Art und Distribution stimmen überein.
2. Die verzeichnete Server-PID ist verstorben oder die PID-Startzeit weicht vom Eintrag ab.
3. Die aktuelle PID-Startzeit des Agent stimmt mit dem Eintrag überein und die Prozessumgebung enthält
   weiterhin dieselbe `ownerId`.
4. Das Ziel-Executable/der Ziel-Befehl gehört zu einem ZCode-Deployment-Pfad.

Scheitert eine Prüfung, wird nur eine Warnung protokolliert und der Eintrag übersprungen. Waisen aus alten
Versionen ohne Owner-Registry dürfen nicht automatisch nach Namen bereinigt werden; nach der ersten
Veröffentlichung kann in der Diagnose ein Hinweis auf manuelle Bereinigung erfolgen, um versehentliches
Abschließen von Prozessen ohne nachweisbaren Owner zu vermeiden.

## Zeitbudget

Zeitbudgets werden als Konstanten geführt und in Tests injiziert, nicht als verstreute Magic Numbers:

| Phase | Empfohlener Standardwert | Erläuterung |
| --- | ---: | --- |
| Graceful Exit des Agent über stdin | 300 ms | Wiederverwendung des aktuellen schnellen Pfads im Release-Zustand |
| TERM/KILL-Fallback der Agent-Prozessbaum | 2.250 ms | Aktuell 2 s + 250 ms Fallback |
| RPC-Stop des Remote-Servers | 1.000 ms | Bei Timeout wird das Service-Dispose fortgesetzt |
| Service-/Agent-Dispose des Remote-Servers | 3.500 ms | Deckt den Fallback der Agent-Prozessbaum ab |
| Schließen des Remote-Streams im Host | 5.000 ms | Deckt die beiden Server-Phasen ab und lässt Planungsmarge |
| Main-Fallback pro Host (erzwungen) | 6.000 ms | Muss nach den normalen Budgets von Host/Remote liegen |
| Sammel-Barriere von App/Update | 8.000 ms | Hosts werden parallel erwartet, nicht nach Anzahl aufsummiert |

Die E2E-Abdeckung kann die vorhandene verlängerte coverage-spezifische Konfiguration nutzen. Alle Timeout-Logs
müssen phase, Host-Label, PID, Remote-Art und elapsedMs enthalten; hochfrequente Protokollframes dürfen nicht
auf info angehoben werden.

## Web-Fernsteuerung und Grenzen zwischen Endgeräten

- Vor dem Tear-down von App/Fenster werden die mobilen Attachments dieses Hosts geschlossen, damit deren
  connection scope `closed` sendet und die owned Subscriptions freigibt.
- Replayable Snapshots, Queues oder Task-Zustände werden nicht zur Unterstützung des Shutdowns in main kopiert.
- Der Desktop-WSL-Attachment ist immer `desktop-continuous`; der Mobil-Attachment immer
  `web-remote-replayable`.
- Das Dispose der Phone-Bridge gibt nur den Attachment frei und löst kein Host-Shutdown aus.
- Gemeinsame SSH Hosts werden beim App-/Fenster-Tear-down vollständig zurückgewonnen; das Schließen einer
  einzelnen logischen Session detacht weiterhin nur.
- `workspaceIdentity`, `remoteSessionId` und das owner/lease-Routing ändern sich nicht durch die
  Prozessrückgewinnungs-Schnittstelle.

## Fehlerbehandlung und Logging

- Main: Start der App-/Update-Barriere, Host-Anzahl, jeder Host mit Timeout und Abschluss der Barriere
  verwenden `info/warn`.
- Host: Der Lebenszyklus Dispose/disconnect/remote close nutzt den Service-Logger; normale Phasen sind
  `info`, Timeouts `warn`, Cleanup-Fehler `error`.
- WSL-Backend: Einmaliges spawn/exit/erzwungener Fallback verwendet seltene Lebenszyklus-Logs; Secrets aus der
  Befehlsumgebung dürfen nicht protokolliert werden.
- Owner-Reaper: Erfolgreiche Rückgewinnung `info`, Prüfungsfehler/Überspringen `warn`, kein vollständiges environ.
- Alle Dispose-APIs sind idempotent; ein zweiter Aufruf verwendet das laufende Ergebnis erneut und sendet
  kein Signal erneut.

## Testdesign

### Desktop-Main-Unit-Tests

- Der App-Shutdown wartet gleichzeitig auf Local, WSL dediziert, Docker/Server dediziert, SSH gemeinsam und
  Bot Runtimes.
- Alle Hosts werden parallel erwartet und nach Prozessobjekt dedupliziert.
- Nach dem Dispose pro Fenster beim `closed` bleibt der erneute Aufruf durch die App-Barriere idempotent.
- Nach der Update-Vorbereinitung verwendet `before-quit` dasselbe Shutdown-Ergebnis wieder.
- Tray-Minimierung, Minimieren und Renderer-Reload rufen kein app-weites Remote-Dispose auf.
- Ausstehende SSH-Verbindungen werden beim Shutdown abgelehnt und der Host wird zurückgewonnen.

### Host-/Server-Unit-Tests

- Dispose durch Parent, SIGTERM, SIGINT, disconnect und remote close laufen in denselben Single-Flight.
- Wenn der RPC-Stop dauerhaft aussteht, wird nach der Deadline trotzdem der Service-/Agent-Dispose aufgerufen.
- Bei fehlgeschlagenem Service-Dispose wird die Remote-Verbindung trotzdem geschlossen.
- Normales Schließen der Remote-Verbindung, Timeout-Fallback und wiederholtes Dispose.
- Nach einem Shutdown-Timeout verwendet der Prozess den erwarteten Exit-Code, das Log enthält die Phase.

### WSL-Backend-Unit-Tests

- Children von `exec`/`execFile` werden registriert und nach dem Exit entfernt.
- Bei normalem Exit durch stdin-EOF kein erzwungener Kill.
- Der Grace-Timeout beendet nur Children, die vom aktuellen Backend gestartet wurden.
- Der Backend-Dispose ruft weder `wsl --terminate` noch `--shutdown` auf.
- Fehlgeschlagener Verbindungsaufbau, abgebrochener Upload und fehlgeschlagenes Deploy hinterlassen keine
  Child-Handles.

### Owner-Registry-/Reaper-Unit-Tests

- Rückgewinnung, wenn der Server verstorben ist und Agent-PID/Startzeit/env/ownerId vollständig übereinstimmen.
- Überspringen bei wiederverwendeter PID, nicht übereinstimmender ownerId, nicht übereinstimmendem Pfad oder
  beschädigtem Registry.
- Bei normalem Exit wird das Registry gelöscht.
- Alte Prozesse ohne Owner-Registry werden nicht durchsucht und nicht zurückgewonnen.

### Verifikation mit echtem WSL

1. Einen WSL-Workspace öffnen und eine echte Agent-Session starten.
2. Minimieren, in den Tray minimieren, Renderer-Reload; bestätigen, dass die ursprünglichen Host-/server-/Agent-PIDs
   erhalten bleiben.
3. Das echte Fenster schließen; bestätigen, dass WSL-Host, server und Agent dieses Fensters innerhalb der
   Deadline beenden, die Distribution aber weiterhin Running ist.
4. Erneut verbinden und die gesamte App beenden; bestätigen, dass alle ZCode-eigenen WSL-Prozesse beenden.
5. Erneut verbinden und die Update-Installationsvorbereitung auslösen; bestätigen, dass die Prozesse vor der
   Übergabe beenden.
6. Host-disconnect, ausstehenden RPC-Stop und ausstehendes Service-Dispose injizieren; bestätigen, dass eine
   begrenzte Absicherung erfolgt und keine neuen Waisen entstehen.
7. Einen Waisen mit gültigem Owner-Registry erzeugen; nach erneuter Verbindung bestätigen, dass nur dieser
   Owner zurückgewonnen wird und normale WSL-Benutzerprozesse unberührt bleiben.
8. Den WSL-Workspace vom Telefon aus anhängen und die Verbindung trennen; bestätigen, dass nur der Attachment
   freigegeben wird und der Desktop-Host/Agent weiterläuft; nach Schließen der App erfolgt der Gesamtexit.

Mechanische Verifikation im Repository:

```sh
pnpm typecheck
pnpm lint
```

## Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
| --- | --- |
| Update/App-Quit wird langsamer | Hosts werden parallel erwartet; normale Exits ereignisgesteuert, nur Ausnahmen erreichen die Deadline |
| Invertierte Timeout-Ebenen führen dazu, dass die obere Ebene die untere zuerst abschließt | Einheitliche Budgetkonstanten und Test der strikten Reihenfolge: Agent < Server < Host < App |
| Doppeltes Dispose durch Fenster/App/Update | Single-Flight + Dedup nach Prozessobjekt + Registry-Eintrag vor dem Warten entfernen |
| Versehentliches Abschließen von Benutzer-WSL-Prozessen | Distribute-Terminate verboten; mehrfache Prüfung über ownerId + PID-Startzeit + env + Executable |
| Host wird beim Trennen des Telefons versehentlich abgeschlossen | Mobile Attachment und Host-Owner sind geschichtet, Bridge-Dispose wird getestet |
| Regression bei SSH/Docker | Einheitliche Schnittstelle kompatibel zum alten `dispose()`, Backend-Verhalten jeweils separat abgedeckt |
| main hält fachlichen Zustand | Der Manager hält nur den Host-/Session-Lebenszyklus, nicht task/queue/snapshot |

## Reihenfolge der Umsetzung

1. Zuerst fehlschlagende Tests für die Desktop-Main-App-/Update-Shutdown-Barriere ergänzen.
2. `disposeAllAndWaitForAppShutdown` im Remote-Session-Manager sowie Host-Dedup/Idempotenz implementieren.
3. Fehlschlagende Tests für Phase-Timeouts in Host/Server ergänzen, Shutdown-Reihenfolge und
   disconnect-Absicherung korrigieren.
4. `RemoteConnection.disposeAndWait` hinzufügen, Cleanup bei fehlgeschlagenem Verbindungsaufbau ergänzen.
5. Das WSL-Backend seine selbst gestarteten Children verfolgen und begrenzt zurückgewinnen lassen.
6. Owner-Registry und Reaper mit strikter Prüfung ergänzen.
7. Desktop continuous, Mobile replayable, SSH-Pool und Docker-/Server-Remote regressionsprüfen.
8. Verifikation im laufenden echten WSL abschließen, `pnpm typecheck`, `pnpm lint`.

## Abnahmekriterien

- Die drei Owner-Tear-down-Pfade (Fenster schließen, App beenden, Update installieren) können belegen, dass
  der jeweilige ZCode-Host/server/Agent innerhalb der Deadline beendet.
- Tray-Minimierung, Minimieren, Renderer-Reload und Trennung vom Telefon beenden keine Runtime, die einem
  weiterhin gültigen Owner gehört.
- Ein ausstehendes oder werfendes Shutdown in irgendeiner Phase verhindert nicht, dass nachfolgende
  Cleanup-Phasen versucht werden.
- Die WSL-Distribution bleibt nutzbar, Benutzerprozesse ohne ZCode-Bezug sind unberührt.
- Es entstehen keine neuen ZCode Agents mit PPID 1; historische Waisen mit gültigem Owner-Registry können
  bei der nächsten Verbindung sicher zurückgewonnen werden.
- Typecheck, Lint und die relevanten Unit-/Integrationstests bestehen vollständig.