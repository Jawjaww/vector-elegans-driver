/**
 * LA PASTILLE EST UN DISQUE, ET ELLE NE PORTE PLUS DE VOYANT VERT.
 *
 * Retour du proprietaire : « une pastille noire qui devrait etre ronde mais la elle est seulement
 * arrondie sur les cotes tandis qu'en haut et en bas c'est plat, avec un V bleu dirige vers le bas
 * et un voyant vert qu'il faut aussi enlever ».
 *
 * Le defaut etait mesurable dans la source : une boite de 52 x 32 avec un rayon de height / 2
 * arrondit les cotes et laisse le haut et le bas droits. C'est de l'arithmetique, pas du gout — donc
 * elle se verifie.
 *
 * Ce test lit le Kotlin, comme `fcmServiceResolution.test.ts` lit le plugin : le rendu d'une vue
 * native ne se teste pas depuis Jest, mais la regle qui le produit, oui. Un APK est de toute facon
 * necessaire (toute ligne de Kotlin dans modules/ en exige un), et c'est precisement pourquoi la
 * regle doit etre tenue par un test plutot que par une relecture.
 */
const { readFileSync } = require("fs") as {
  readFileSync: (path: string, encoding: string) => string;
};
const { join } = require("path") as { join: (...parts: string[]) => string };

const SOURCE = () =>
  readFileSync(
    join(
      process.cwd(),
      "modules",
      "ve-overlay",
      "android",
      "src",
      "main",
      "java",
      "expo",
      "modules",
      "veoverlay",
      "VeOverlayController.kt",
    ),
    "utf8",
  );

describe("the online pill", () => {
  it("est un carre, donc un disque une fois le rayon applique", () => {
    const source = SOURCE();
    const width = source.match(/BUBBLE_WIDTH_DP = (\d+(?:\.\d+)?)f/);
    const height = source.match(/BUBBLE_HEIGHT_DP = (\d+(?:\.\d+)?)f/);

    expect(width?.[1]).toBe("48");
    expect(height?.[1]).toBe("48");

    // Avec un carre et un rayon de height / 2, le rectangle arrondi EST un cercle. Une largeur
    // superieure a la hauteur ramenerait les cotes plats du haut et du bas.
    expect(source).toContain("val corner = heightPx / 2f");
  });

  it("n'a plus de voyant vert", () => {
    const source = SOURCE();

    // La couleur du voyant, et le seul appel qui le dessinait.
    expect(source).not.toContain("#10B981");
    expect(source).not.toContain("dotPaint");
    expect(source).not.toContain("canvas.drawCircle");
    expect(source).not.toContain("Online dot");
  });

  it("recentre le V, qui etait decale pour degager le voyant", () => {
    const source = SOURCE();

    expect(source).toContain("val cx = w / 2f");
    // L'ancien decalage : 40 % de la largeur, pour laisser la place au voyant a 72 %.
    expect(source).not.toContain("w * 0.40f");
  });

  it("garde le V bleu et le fond noir", () => {
    const source = SOURCE();

    expect(source).toContain('Color.parseColor("#3B82F6")');
    expect(source).toContain('Color.parseColor("#171717")');
  });
});
