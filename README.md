# ISLAND DROP — Battle Royale

## Projekt

Eine Browser-3D-Spielwelt auf Grundlage der mitgelieferten Inselkarte `island-map.jpeg`. Alle Projektdateien liegen absichtlich direkt im Hauptverzeichnis. Es gibt keinen `Models`-Ordner und keine Texturen-Unterordner. Texturen werden im Browser von URLs geladen; falls ein externer Textur-Link nicht erreichbar ist, bleibt eine prozedurale Ersatztextur aktiv.

## Lokal starten

Benötigt Node.js 18 oder neuer.

```bash
npm start
```

Danach `http://localhost:10000` öffnen.

## Render

Ein **Web Service**-Projekt aus dem Repository erstellen. Build Command: `npm install`. Start Command: `npm start`. `server.js` verwendet automatisch die `PORT`-Variable von Render.

## Steuerung

- **SPIELEN** — Matchmaking öffnen
- **M** — Inselkarte öffnen oder schließen
- **Klick auf die Karte** — private rote Markierung setzen
- **Markierung anklicken + „MARKIERUNG LÖSCHEN“** — ausgewählten Punkt entfernen
- **Leertaste im Flugzeug** — Spitzhacke nehmen, zur offenen Heckklappe laufen und abspringen
- **Klick in die Spielansicht** — Maus-Look aktivieren
- **Maus** — First-Person-Kamera drehen
- **W/A/S/D** — bewegen und nach dem Fallschirmöffnen die Richtung steuern
- **E gedrückt halten** — Truhe öffnen (Truhen sind absichtlich leer)
- **Shift** — am Boden schneller laufen
- **Esc** — Pointer-Lock freigeben

## Multiplayer-Hinweis

`server.js` ist ausschließlich ein einfacher Datei-Webserver für Render, kein Game-Server. Die Zwei-Spieler-Suche nutzt darum `BroadcastChannel` und verbindet zwei Tabs/Fenster **im selben Browser-Profil und auf derselben Website**. Sie ist kein echtes Internet-Matchmaking zwischen zwei Geräten oder unterschiedlichen Browser-Profilen. Dafür wäre später ein Multiplayer-Backend nötig.

## Enthaltene Systeme

- 3D-Insel mit 16 benannten Regionen, Terrain-Biomen, Straßen, Küsten, Bäumen, Gebäuden, Felsen, Wasserflächen und 46 leeren, pseudorandom platzierten Truhen
- Fortnite-inspirierte Lobby mit gelbem SPIELEN-Button und synthetisch erzeugtem, kräftigem Klick-Sound
- Militärtransportflugzeug mit Innenraum und offener Heckklappe
- First-Person-Hände mit Fingern/Gelenkdetails, Spitzhacken- und Absprungsequenz
- freier Fall und automatisches Öffnen des Fallschirms nach drei Sekunden
- HUD erst nach Fallschirmöffnung: 100 Leben, 50 Schild, Minimap und Glitch-Einblendung
- bildschirmfüllende Karte mit privaten, löschbaren Markierungen und roten 3D-Wegpunkten
- Truhen-Interaktion per E-Halten mit Fortschrittskreis; keine Beute

Die 3D-Insel ist prozedural nach den Regionen, Biomen und der Küstenform der gelieferten Karte aufgebaut. Das Bild wird außerdem für die große Karte und Minimap verwendet.
