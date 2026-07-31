#!/usr/bin/env bash
# naming-guard.sh — verhindert, dass interne Netz-/Hostnamen ODER hardcodierte
# Klartext-Secrets in dieses OEFFENTLICHE Repo gelangen. Prueft alle
# git-getrackten Textdateien. Exit 1 + Trefferliste bei Fund, sonst 0.
# Vorbild: secure-reverse-proxy / unifi-cam-proxy-redalert (Wissen #344/#354/#780).
#
# Ausnahmen (bewusst, dokumentiert):
#   - Inline:  am Zeilenende den Marker  naming-guard:allow  setzen.
#   - Regex:   eine erweiterte Regex je Zeile in .naming-guard-allow ablegen
#              (matcht gegen 'datei:zeile:inhalt'); '#'-Kommentare/Leerzeilen erlaubt.
set -euo pipefail

cd -- "$(git rev-parse --show-toplevel)"

# 1) Interne Netz-/Hostnamen (Wissen #354):
#    interne 10.<VLAN>.x.x Host-IPs aller VLANs (2. Oktett nonzero) + Exposed-Net;
#    private 192.168.x.x; interne Router-Domain (fritz.box); Eigen-Domain (derwerres.de);
#    Proxmox-Realm root@pam.
#    Bewusst NICHT erfasst (generische Beispiele): RFC1918-CIDR-Ranges (/8,/12,/16),
#    Doku-Beispiel-Backends 10.0.0.x sowie RFC5737-Doku-IPs (192.0.2.x/198.51.100.x/203.0.113.x).
#    Sollte je ein generischer CIDR-Range (z.B. 192.168.0.0/16) als Doku noetig sein,
#    per .naming-guard-allow bzw. Zeilen-Marker ausnehmen.
NET_PATTERN='10\.[1-9][0-9]?\.[0-9]{1,3}\.[0-9]{1,3}|10\.0\.[1-9][0-9]{0,2}\.[0-9]{1,3}|192\.168\.[0-9]{1,3}\.[0-9]{1,3}|fritz\.box|derwerres\.de|root@pam'

# 2) Hardcodierte Klartext-Secrets:
#    - quoted Secret-Zuweisung: (password|secret|token|api_key|...) = "…" bzw. : "…" (>=8 Zeichen).
#    - PRIVATE-KEY-Header (BEGIN … PRIVATE KEY).
#    Offensichtliche Platzhalter (EXAMPLE/REPLACE/CHANGEME/DUMMY/PLACEHOLDER/XXXX/<...>) ausgenommen.
SECRET_PATTERN='(password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key)[a-zA-Z_]*[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"' ]{8,}["'"'"']|BEGIN[[:space:]]+(RSA|EC|OPENSSH|DSA|PGP)?[[:space:]]*PRIVATE KEY'
PLACEHOLDER='EXAMPLE|REPLACE|CHANGEME|CHANGE_ME|DUMMY|PLACEHOLDER|XXXX|<[a-z_]+>'

ALLOW_FILE='.naming-guard-allow'

allow_filter() {
  if [[ -s "$ALLOW_FILE" ]]; then
    grep -vEf <(grep -vE '^[[:space:]]*(#|$)' "$ALLOW_FILE")
  else
    cat
  fi
}

hits="$(
  git ls-files -z \
    | xargs -0 grep -HnIE "$NET_PATTERN|$SECRET_PATTERN" -- 2>/dev/null \
    | grep -vE "$PLACEHOLDER" \
    | grep -v 'naming-guard:allow' \
    | grep -v "^${ALLOW_FILE}:" \
    | grep -v '^scripts/naming-guard\.sh:' \
    | allow_filter \
    || true
)"

if [[ -n "$hits" ]]; then
  {
    echo "naming-guard: interne Netz-/Hostnamen oder Klartext-Secrets in getrackten Dateien gefunden"
    echo "             (dies ist ein OEFFENTLICHES Repo — solche Werte gehoeren nicht hierher):"
    echo
    echo "$hits"
    echo
    echo "Behebung: Wert durch offensichtlichen Platzhalter ersetzen (z.B. example.net / <host> / EXAMPLE_TOKEN)."
    echo "Bei echtem Secret: rotieren (gilt als kompromittiert, sobald oeffentlich)."
    echo "Bewusste Ausnahme: Zeilen-Marker  naming-guard:allow  oder Regex in ${ALLOW_FILE}."
  } >&2
  exit 1
fi

echo "naming-guard: ok — keine internen Netz-/Hostnamen oder Klartext-Secrets in getrackten Dateien."
