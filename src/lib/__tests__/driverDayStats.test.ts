// Aucun type Node dans ce projet : le motif deja utilise par les autres tests d'ici.
const { readFileSync } = require("fs") as {
  readFileSync: (path: string, encoding: string) => string;
};
const { join } = require("path") as { join: (...parts: string[]) => string };

/**
 * LA CARTE « JOURNÉE » COMPTE LA JOURNÉE, PAS LE MOIS.
 *
 * Retour du propriétaire : « la carte journée et la carte courses, ça indique 6 000 et quelques
 * euros [...] ça semble pas être la journée. Donc indique seulement les courses de la journée et
 * l'argent gagné dans cette journée. »
 *
 * La cause était nommée dans ce dépôt depuis l'onglet Courses : `stats.todayEarnings` et
 * `stats.todayRides` sont **persistés dans AsyncStorage** et incrémentés à chaque fin de course,
 * sans rien qui les remette à zéro à minuit. Le chiffre reste donc « vrai » tant que le téléphone
 * n'est pas laissé passer une nuit — et au bout de quelques semaines, « Journée » annonce un cumul.
 * L'onglet Courses avait été corrigé (`summarizeHistoryToday`) ; **le bottom sheet avait été
 * oublié**.
 *
 * Ce test tient la règle là où elle casse : dans le rendu. Il lit le source, parce qu'une valeur
 * persistée ne se distingue pas d'une valeur du jour à l'écran — c'est bien pour cela que le défaut
 * a survécu.
 */
const SCREEN = () =>
  readFileSync(join(process.cwd(), "app", "(tabs)", "index.tsx"), "utf8");

/**
 * Le bloc de la carte, isolé du reste de l'écran (le fichier fait plus de 2 000 lignes).
 *
 * Les commentaires sont RETIRÉS avant tout scan — la technique du dépôt pour cette classe de test.
 * Le commentaire qui explique le défaut nomme `stats.todayEarnings` : sans ce retrait, le test
 * échouerait sur sa propre prose, et c'est exactement l'erreur que j'ai commise sur le portail
 * opérateur quelques minutes plus tôt.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function dayStatsBlock(): string {
  const source = stripComments(SCREEN());
  const start = source.indexOf("function DriverDayStatsRow()");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end === -1 ? undefined : end);
}

describe("the driver's day card", () => {
  it("dérive la journée des courses du serveur", () => {
    const block = dayStatsBlock();

    expect(block).toContain("summarizeHistoryToday");
    expect(block).toContain("fetchCompletedRides(localDayBounds(");
  });

  it("ne lit plus les totaux persistés du store", () => {
    // Le cœur du défaut : ces deux champs survivent à minuit.
    expect(dayStatsBlock()).not.toContain("stats.todayEarnings");
    expect(dayStatsBlock()).not.toContain("stats.todayRides");
  });

  it("recharge quand une course se termine, sinon le chiffre reste celui d'avant", () => {
    const block = dayStatsBlock();

    // L'identifiant de la course active retombe à null à la fin d'une course : c'est le signal.
    expect(block).toContain("state.activeRide?.id");
    expect(block).toMatch(/\[load, activeRideId\]/);
  });

  it("n'affiche pas zéro quand la lecture a échoué", () => {
    const block = dayStatsBlock();

    // Un échec laisse le chiffre précédent ; « pas encore lu » n'est pas « rien gagné ».
    expect(block).toContain('?? null');
    expect(block).toContain('"—"');
  });

  it("porte ses libellés en i18n, pas en français codé en dur", () => {
    const block = dayStatsBlock();

    expect(block).toContain('t("ridesScreen.earned")');
    expect(block).toContain('t("ridesScreen.rides")');
    expect(block).not.toContain("JOURNÉE");
  });
});

/**
 * LE COMPTEUR « JOURNÉE » PERSISTÉ NE DOIT PAS REVENIR.
 *
 * Il a produit le défaut deux fois : une fois dans l'onglet Gains (`todayEarnings × 3.5` — des
 * montants inventés) et une fois dans la carte Journée du bottom sheet, qui a affiché un cumul de
 * plusieurs mois sous ce mot. La cause est toujours la même : un compteur incrémenté à la fin d'une
 * course et rangé dans AsyncStorage, sans rien qui le remette à zéro à minuit.
 *
 * Le retirer ne suffit pas — il faut rendre son retour visible. Les journées se lisent désormais
 * dans les lignes du serveur, seul compteur qui se remet à zéro tout seul.
 */
describe("the store keeps no persisted day counter", () => {
  const STORE = () =>
    stripComments(
      readFileSync(
        join(process.cwd(), "src", "lib", "stores", "driverStore.ts"),
        "utf8",
      ),
    );

  it("ne déclare plus de total de journée dans stats", () => {
    const store = STORE();

    expect(store).not.toContain("todayEarnings");
    expect(store).not.toContain("todayRides");
  });

  it("ne les incrémente plus à la fin d'une course", () => {
    const store = STORE();
    const completeRide = store.slice(store.indexOf("completeRide:"));

    // La fin de course ne touche plus aux statistiques : elle libère la course active, c'est tout.
    expect(completeRide.slice(0, 400)).not.toContain("stats:");
  });
});

/**
 * MINUIT NE SE VOIT PAS.
 *
 * Un chauffeur en ligne à 23h59 garderait le total de la veille jusqu'au prochain rechargement, et
 * la carte mentirait sur le mot « depuis minuit ». La correction ne doit pas coûter une requête par
 * minute pour autant : on recalcule le jour courant, et on ne va chercher le serveur que s'il a
 * changé — au plus une requête par jour.
 */
describe("the day boundary", () => {
  it("recharge quand le jour change, et seulement alors", () => {
    const block = dayStatsBlock();

    expect(block).toContain("setInterval");
    expect(block).toContain("localDayBounds(new Date()).start.toISOString()");
    // La comparaison qui évite la requête inutile : le rechargement est conditionné au changement.
    expect(block).toMatch(/dayKey !== current\) void load\(\)/);
    // Et le jour affiché est mémorisé, sinon il n'y a rien à comparer.
    expect(block).toContain("setDayKey(");
  });
});
