// Exposed sensitive-files scanner — checks a fixed list of well-known paths
// (.env, .git/config, database backups, config backups...) to see if the
// server serves them publicly. Independent of rawFetch()/renderWithChrome():
// plain GET requests to a handful of fixed paths, no HTML parsing involved —
// mirrors the async, best-effort pattern used for SSL expiry in Ssl.js (own
// network calls, own try/catch, pushed into analysis.checks from audit.js
// rather than from analyzer.js).

const REQUEST_TIMEOUT_MS = 8000;

// Each entry: the path to probe, a human label, a severity, and an optional
// validate() to reduce false positives from servers that return 200 with a
// custom "not found" page instead of a real 404.
const SENSITIVE_PATHS = [
    {
        path: '/.env',
        severity: 'critical',
        label: 'Fichier .env exposé',
        detail: 'Le fichier .env est accessible publiquement — il contient souvent des clés API, mots de passe de base de données et autres secrets.',
        validate: (body) => /^[A-Z0-9_]+\s*=.+/m.test(body),
    },
    {
        path: '/.env.local',
        severity: 'critical',
        label: 'Fichier .env.local exposé',
        detail: 'Le fichier .env.local est accessible publiquement — il contient souvent des secrets d\u2019environnement.',
        validate: (body) => /^[A-Z0-9_]+\s*=.+/m.test(body),
    },
    {
        path: '/.git/config',
        severity: 'critical',
        label: 'Dossier .git exposé',
        detail: 'Le dossier .git est accessible publiquement — l\u2019historique complet du code source (et potentiellement d\u2019anciens secrets) peut être reconstitué.',
        validate: (body) => body.includes('[core]'),
    },
    {
        path: '/.git/HEAD',
        severity: 'critical',
        label: 'Dossier .git exposé',
        detail: 'Le dossier .git est accessible publiquement — l\u2019historique complet du code source peut être reconstitué.',
        validate: (body) => body.trim().startsWith('ref:'),
    },
    {
        path: '/backup.sql',
        severity: 'critical',
        label: 'Sauvegarde de base de données exposée (backup.sql)',
        detail: 'Un fichier backup.sql est accessible publiquement — il peut contenir l\u2019intégralité de la base de données, y compris des données utilisateurs.',
        validate: (body) => /INSERT INTO|CREATE TABLE/i.test(body),
    },
    {
        path: '/database.sql',
        severity: 'critical',
        label: 'Sauvegarde de base de données exposée (database.sql)',
        detail: 'Un fichier database.sql est accessible publiquement — il peut contenir l\u2019intégralité de la base de données.',
        validate: (body) => /INSERT INTO|CREATE TABLE/i.test(body),
    },
    {
        path: '/wp-config.php.bak',
        severity: 'critical',
        label: 'Sauvegarde de configuration WordPress exposée',
        detail: 'Une sauvegarde de wp-config.php est accessible publiquement — elle contient les identifiants de connexion à la base de données.',
        validate: (body) => /DB_PASSWORD|DB_USER/i.test(body),
    },
    {
        path: '/config.php.bak',
        severity: 'critical',
        label: 'Sauvegarde de fichier de configuration exposée',
        detail: 'Une sauvegarde de fichier de configuration est accessible publiquement.',
        validate: null,
    },
    {
        path: '/.htpasswd',
        severity: 'high',
        label: 'Fichier .htpasswd exposé',
        detail: 'Le fichier .htpasswd est accessible publiquement — il contient des identifiants (souvent hashés) protégeant certaines zones du site.',
        validate: null,
    },
    {
        path: '/phpinfo.php',
        severity: 'medium',
        label: 'Fichier phpinfo.php exposé',
        detail: 'phpinfo.php est accessible publiquement — il révèle la configuration serveur, chemins internes et versions logicielles, utile à un attaquant.',
        validate: (body) => /phpinfo\(\)|PHP Version/i.test(body),
    },
];

/**
 * Probes each known sensitive path against `baseUrl`. Never throws — a
 * failed/aborted request for a given path is simply treated as "not
 * exposed" for that path, same best-effort philosophy as getCertificateExpiry().
 *
 * @param {string} baseUrl e.g. "https://example.com"
 * @returns {Promise<Array<{path:string, severity:string, label:string, detail:string}>>}
 */
export async function scanExposedFiles(baseUrl) {
    const origin = new URL(baseUrl).origin;
    const found = [];

    await Promise.all(
        SENSITIVE_PATHS.map(async (entry) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            try {
                const res = await fetch(origin + entry.path, {
                    redirect: 'manual', // a redirect to a login/404 page is not "exposed"
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; SEO-Optimizer/1.0; +https://welyne.com/bot)',
                    },
                });
                if (res.status !== 200) return;

                const body = await res.text();
                if (entry.validate && !entry.validate(body)) return;
                // Guard against a custom "soft 404" HTML page that happens to return
                // 200 for everything but isn't actually the sensitive file.
                if (!entry.validate && /<html/i.test(body) && body.length > 2000) return;

                found.push({
                    path: entry.path,
                    severity: entry.severity,
                    label: entry.label,
                    detail: entry.detail,
                });
            } catch {
                // timeout, connection refused, DNS error, abort... = not exposed, ignore
            } finally {
                clearTimeout(timer);
            }
        })
    );

    return found;
}

/**
 * @param {Array<{path:string, severity:string, label:string, detail:string}>} found
 * @returns {object|null} a check object (same shape as analyzer.js's check()),
 *   or null if `found` is undefined (scan never ran).
 */
export function exposedFilesCheck(found) {
    if (!found) return null;

    if (!found.length) {
        return {
            category: 'security',
            id: 'exposed_files',
            label: 'Exposed Sensitive Files',
            status: 'pass',
            value: 'Aucun fichier sensible détecté',
            detail: 'Aucun des fichiers sensibles courants (.env, .git, sauvegardes...) n\u2019est accessible publiquement.',
        };
    }

    const hasCritical = found.some((f) => f.severity === 'critical');
    const paths = found.map((f) => f.path).join(', ');

    return {
        category: 'security',
        id: 'exposed_files',
        label: 'Exposed Sensitive Files',
        status: hasCritical ? 'fail' : 'warn',
        value: `${found.length} fichier(s) exposé(s)`,
        detail: `Fichier(s) sensible(s) accessible(s) publiquement : ${paths}. ${found[0].detail}`,
        findings: found,
    };
}