# Outil d'Audit SEO — Présentation & Guide

*Document destiné au client — langage simple, sans jargon technique.*

---

## 1. À quoi sert l'outil ?

Vous entrez l'adresse d'un site web (par exemple `https://exemple.com`) et l'outil
analyse automatiquement ce site pour produire un **rapport SEO complet** : une note
globale, des notes par thème, des explications claires, des recommandations
écrites par une intelligence artificielle, et un **rapport PDF** prêt à être envoyé
à un client.

C'est l'équivalent d'outils payants comme SEOptimer — mais chez nous, à notre image,
et avec plusieurs fonctions supplémentaires.

---

## 2. Comment ça marche, en bref ?

1. **On visite le site comme un visiteur réel.** L'outil ouvre la page dans un
   navigateur automatisé (le même moteur que Google Chrome), prend des captures
   d'écran et mesure la vitesse.
2. **On explore plusieurs pages du site**, pas seulement la page d'accueil
   (jusqu'à une trentaine de pages), pour avoir une vision d'ensemble.
3. **On lance une cinquantaine de vérifications** réparties en grandes catégories.
4. **On calcule une note** pour chaque catégorie et une note globale.
5. **L'intelligence artificielle rédige** un résumé et des recommandations.
6. **On génère le rapport** à l'écran et en PDF.

---

## 3. La note globale (de A+ à F)

Chaque vérification reçoit l'un de trois résultats :

- ✅ **Réussi** (vert)
- ⚠️ **À améliorer** (orange)
- ❌ **Problème** (rouge)

Chaque vérification a aussi une **importance** (un poids) : par exemple, « le site
est-il en HTTPS ? » compte beaucoup plus que « y a-t-il un favicon ? ».

La note d'une catégorie est une **moyenne pondérée** : on additionne les points de
chaque vérification (réussi = 100 %, à améliorer = 50 %, problème = 0 %) en tenant
compte de leur importance. La note globale fait la même chose sur l'ensemble.

Les lettres correspondent à des paliers : **A+ (90+), A (80+), B (70+), C (60+),
D (50+), E (35+), F (en dessous)**.

---

## 4. Les 7 catégories analysées

Pour chaque catégorie : **ce qu'on vérifie**, **pourquoi c'est important**, et
**comment on le mesure** (en termes simples).

### 4.1 SEO On-Page (le contenu de la page vu par Google)
- **Balise titre** et **méta-description** : le titre et le résumé que Google
  affiche dans ses résultats. On vérifie qu'ils existent et qu'ils ont la bonne
  longueur (titre ~30–65 caractères, description ~70–160).
- **Titres H1/H2…** : la structure des titres de la page.
- **Texte alternatif des images** : la description des images (utile pour Google
  et pour les personnes malvoyantes). On compte combien d'images en sont privées.
- **Balise canonique, données structurées (Schema), indexabilité, robots.txt,
  plan de site (sitemap), URLs propres, présence d'un outil d'analyse (Google
  Analytics…)**.
- *Comment :* on lit le code de la page et on cherche ces éléments précis.

### 4.2 Qualité du contenu
- **Lisibilité** : est-ce facile à lire ? On utilise une formule reconnue (l'indice
  de lisibilité de Flesch) qui regarde la longueur des phrases et des mots. Plus le
  score est élevé, plus c'est facile à lire.
- **Nombre de mots** : un contenu trop court (« mince ») est pénalisé.
- **Mots-clés et expressions** : on compte les mots les plus fréquents et les
  expressions de deux mots qui reviennent. La « densité » d'un mot = son nombre
  d'occurrences ÷ le nombre total de mots. Si un mot dépasse ~5 %, on signale un
  risque de « bourrage de mots-clés ».
- **Cohérence des mots-clés** : un tableau qui montre si vos mots-clés principaux
  apparaissent aussi dans le titre, la description, les sous-titres et l'URL.
- *Comment :* on extrait le texte visible de la page (sans le menu/le bas de page)
  et on applique ces calculs. L'outil reconnaît le français, l'anglais, l'espagnol
  et l'allemand pour ignorer les mots vides (« le », « de », « and »…).

### 4.3 Liens
- **Liens cassés** : on teste réellement les liens du site (internes et externes)
  pour repérer ceux qui mènent à une page d'erreur.
- **Liens internes / externes**, **textes de lien descriptifs** (on évite les
  « cliquez ici »), **liens vides**.
- *Comment :* on rassemble tous les liens des pages explorées et on les « visite »
  rapidement pour vérifier qu'ils répondent correctement (jusqu'à 250 liens).

### 4.4 Convivialité (Usability)
- **Compatibilité mobile** (balise « viewport »), **favicon**, **langue déclarée**,
  **encodage**, **taille de la page**, **confidentialité des e-mails** (adresses
  visibles en clair = cible pour les spammeurs), **Flash** (technologie obsolète),
  **iframes**, **balises HTML dépassées**.

### 4.5 Performance (vitesse)
- **Temps de chargement, poids de la page, nombre de requêtes, compression,
  mise en cache, optimisation des images, minification du code, ressources qui
  bloquent l'affichage, utilisation d'un CDN.**
- *Comment :* on mesure ces valeurs pendant le chargement réel de la page.

### 4.6 Réseaux sociaux
- **Open Graph** et **carte Twitter/X** : les informations qui rendent vos liens
  jolis quand on les partage sur Facebook, LinkedIn, X…
- **Présence sur les réseaux** : on détecte les liens vers vos profils sociaux.
- **Aperçu de partage** : on affiche à quoi ressemblera votre lien partagé.

### 4.7 Sécurité & Technologie
- **HTTPS/SSL**, **en-têtes de sécurité** (HSTS, protection contre le clickjacking…),
  **contenu mixte** (éléments non sécurisés sur une page sécurisée), **version de
  jQuery** (on signale les versions anciennes vulnérables).
- **Technologies détectées** (WordPress, Shopify, React…), **adresse IP du serveur**,
  **type de serveur**, **serveurs de noms (DNS)**.

---

## 5. Google PageSpeed & Core Web Vitals (vitesse selon Google)

L'outil interroge directement le service officiel **Google PageSpeed Insights** et
affiche :
- Les **4 notes Lighthouse** de Google : Performance, SEO, Accessibilité, Bonnes
  pratiques.
- Les **Core Web Vitals** — les indicateurs que Google utilise pour le classement :
  - **LCP** (rapidité d'affichage du contenu principal)
  - **CLS** (stabilité visuelle de la page)
  - **INP** (réactivité aux clics)
- Quand le site a assez de trafic, on affiche les **données réelles des visiteurs**
  (mesurées par Google) ; sinon, une mesure en laboratoire.
- Les **principales opportunités** d'amélioration avec le gain de temps estimé.

---

## 6. Accessibilité & bonnes pratiques

À partir de l'analyse de Google, on liste les **problèmes concrets** d'accessibilité
(par exemple : « contraste de couleurs insuffisant », « titres mal ordonnés ») et de
bonnes pratiques techniques, avec une explication pour chacun.

---

## 7. Aperçus visuels

- **Aperçu Google** : à quoi ressemble la page dans les résultats de recherche
  (titre, adresse, description).
- **Aperçu réseaux sociaux** : la « carte » de partage (image + titre + description).
- **3 appareils** : captures d'écran **ordinateur, tablette et mobile** de la page
  d'accueil.

---

## 8. Recommandations rédigées par l'IA

À partir de toutes les données récoltées, une intelligence artificielle rédige :
- un **résumé** de la santé SEO du site,
- des **gains rapides** (les actions les plus rentables et faciles),
- une **liste de recommandations classées par priorité** (Haute / Moyenne / Basse).

Ces textes sont placés **en haut du rapport** pour aller à l'essentiel.

---

## 9. Comparaison avec les concurrents *(fonction avancée)*

Onglet **« Comparer les concurrents »** : vous entrez votre site + jusqu'à 3
concurrents, et l'outil produit :
- un **tableau de scores côte à côte** (le gagnant de chaque catégorie est mis en
  valeur),
- une analyse **« Où vous êtes en retard »** : pour chaque thème, de combien de
  points un concurrent vous dépasse et lequel,
- un **résumé concurrentiel** et des actions **« Comment gagner »** rédigés par l'IA,
- un **tableau des indicateurs clés** (vitesse, poids, mots, liens cassés…),
- les **captures d'écran** des pages d'accueil de chacun.

---

## 10. Suivi dans le temps (historique)

Chaque audit est **enregistré**. Lorsqu'on réanalyse un même site, le rapport affiche
une **courbe d'évolution** du score et l'écart depuis le dernier audit
(par exemple « ▲ +5 points depuis le dernier audit »). Cela permet de **mesurer les
progrès** après des optimisations.

---

## 11. Rapport PDF & exports

- **PDF** : un rapport complet d'environ 15 à 18 pages, prêt à être envoyé à un
  client.
- **Export JSON** : toutes les données brutes (pour les réutiliser ailleurs).
- **Export CSV** : la liste des vérifications dans un tableur (Excel…).

---

## 12. Personnalisation (marque blanche)

Le rapport porte **votre identité** : nom de l'agence, logo, couleurs, site web,
e-mail et téléphone apparaissent sur la page de couverture et en bas de page. Le
client final voit **votre marque**, pas celle d'un outil tiers. Tout se règle dans
un fichier de configuration.

---

## 13. Bon à savoir : pourquoi deux audits peuvent légèrement différer ?

- Les vérifications du **contenu et du code** (titres, mots-clés, lisibilité,
  sécurité…) donnent **toujours les mêmes résultats** pour une même page.
- En revanche, la **vitesse** est une mesure en direct : elle dépend du réseau et du
  serveur au moment du test, donc elle peut bouger un peu.
- Les liens cassés dépendent de la disponibilité des autres sites à l'instant T.
- Les **textes de l'IA** peuvent être formulés différemment d'une fois à l'autre
  (les constats, eux, restent les mêmes).

C'est normal et identique au fonctionnement des outils du marché.

---

## 14. En résumé : nos atouts par rapport à SEOptimer

- ✅ Toutes les analyses SEO classiques (on-page, contenu, liens, vitesse, social,
  sécurité)
- ✅ **Vrais Core Web Vitals de Google** (vitesse + classement)
- ✅ **Exploration multi-pages** + détection des **liens cassés**
- ✅ **Tableau de cohérence des mots-clés** et **aperçu Google**
- ✅ **Accessibilité** détaillée
- ✅ **Comparaison concurrents** (souvent réservée aux offres payantes)
- ✅ **Suivi dans le temps**, **exports** et **rapport en marque blanche**
- ✅ **Recommandations par IA**
