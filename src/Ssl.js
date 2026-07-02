// SSL certificate expiry checker — opens a raw TLS connection to read the
// certificate's expiry date via Node's native `tls` module. Independent of
// rawFetch()/renderWithChrome(): this is a plain TLS handshake, no HTTP
// request, no HTML involved — mirrors the async, best-effort pattern used
// for Google PageSpeed Insights in psi.js (own network call, own try/catch,
// pushed into analysis.checks from audit.js rather than from analyzer.js).

import tls from 'node:tls';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Opens a TLS connection to `hostname:port` and returns the peer
 * certificate's expiry info, or null if the handshake fails (site not on
 * HTTPS, unreachable, self-signed in a way Node rejects, etc).
 *
 * @returns {Promise<{daysRemaining:number, validTo:string, issuer:string}|null>}
 */
export function getCertificateExpiry(hostname, { port = 443, timeout = 10000 } = {}) {
    return new Promise((resolve) => {
        const socket = tls.connect(
            { host: hostname, port, servername: hostname, timeout, rejectUnauthorized: false },
            () => {
                const cert = socket.getPeerCertificate();
                socket.end();
                if (!cert || !cert.valid_to) {
                    resolve(null);
                    return;
                }
                const validTo = new Date(cert.valid_to);
                const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / DAY_MS);
                resolve({
                    daysRemaining,
                    validTo: validTo.toISOString(),
                    issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
                });
            }
        );
        socket.on('error', () => resolve(null));
        socket.on('timeout', () => { socket.destroy(); resolve(null); });
    });
}

/**
 * @param {{daysRemaining:number, validTo:string, issuer:string}|null} info
 * @returns {object|null} a check object (same shape as analyzer.js's check()),
 *   or null if no certificate info could be read (e.g. site isn't on HTTPS —
 *   the existing 'https' check in analyzer.js already reports that).
 */
export function sslExpiryCheck(info) {
    if (!info) return null;

    const { daysRemaining, validTo, issuer } = info;
    const expiryDate = validTo.slice(0, 10);

    let status, detail;
    if (daysRemaining < 0) {
        status = 'fail';
        detail = `Le certificat SSL a expiré le ${expiryDate} — le site affiche une alerte de sécurité aux visiteurs. Renouvellement immédiat requis.`;
    } else if (daysRemaining < 7) {
        status = 'fail';
        detail = `Certificat SSL expire dans ${daysRemaining} jour(s) (${expiryDate}) — renouvellement urgent recommandé.`;
    } else if (daysRemaining < 30) {
        status = 'warn';
        detail = `Certificat SSL expire dans ${daysRemaining} jours (${expiryDate}) — pensez à planifier le renouvellement.`;
    } else {
        status = 'pass';
        detail = `Certificat SSL valide jusqu'au ${expiryDate} (émis par ${issuer}).`;
    }

    return {
        category: 'security',
        id: 'ssl_expiry',
        label: 'SSL Certificate Expiry',
        status,
        value: daysRemaining < 0 ? 'Expiré' : `${daysRemaining} jour(s) restant(s)`,
        detail,
    };
}