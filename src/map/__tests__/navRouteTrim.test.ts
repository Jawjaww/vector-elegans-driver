import { buildMapHtmlTemplate } from "../mapHtmlTemplate";

/**
 * LA FLÈCHE BOUFFE LE TRACÉ, COMME PAC-MAN.
 *
 * Retour du propriétaire : « le tracé bleu disparaît très mal derrière la flèche comparé à Waze :
 * la flèche devrait donner l'impression de bouffer le tracé comme le jeu Pac-Man, ce qui veut dire
 * que derrière la flèche il ne doit pas y avoir de tracé [...] on devrait même pas voir de tracé
 * bleu derrière la flèche quand elle est passée ».
 *
 * Ce test tient les DEUX moitiés de la règle, parce qu'aucune ne suffit seule :
 *   - le rognage doit partir de la position AFFICHÉE de la flèche, pas du dernier point GPS ;
 *   - et son étranglement doit rester à l'échelle de la flèche, sinon la ligne reste dessinée
 *     sous elle pendant la distance parcourue entre deux rognages.
 *
 * C'est la seconde qui était cassée : la géométrie était juste, mais 25 m d'étranglement
 * laissaient 25 m de bleu derrière la flèche. Ce test échoue sur cette valeur.
 */
const html = () => buildMapHtmlTemplate({ lat: 48.85, lng: 2.35 });

describe("the route is eaten at the arrow", () => {
  it("rogne la ligne depuis la position affichée de la flèche", () => {
    const source = html();

    // `paintPoint` est la position interpolée que la flèche affiche ; `coords` est le point GPS.
    // Rogner depuis le second laisserait la ligne courir jusqu'au fix, donc devant la flèche.
    expect(source).toContain("syncNavRouteStart(onLine ? paintPoint : coords)");
  });

  it("garde l'étranglement à l'échelle de la flèche", () => {
    const match = html().match(/var ROUTE_TRIM_MIN_METERS = (\d+(?:\.\d+)?);/);

    expect(match).not.toBeNull();
    const metres = Number(match?.[1]);

    // Une flèche de guidage couvre une dizaine de mètres à l'écran : en deçà, le reste de ligne
    // est caché SOUS elle. Au-delà, il dépasse derrière et se voit — c'est le défaut rapporté.
    expect(metres).toBeLessThanOrEqual(5);
    expect(metres).toBeGreaterThan(0);
    // La valeur qui produisait le défaut, nommée pour que la régression soit lisible.
    expect(metres).not.toBe(25);
  });

  it("rocrne la géométrie, il ne se contente pas d'effacer la source", () => {
    const source = html();

    // Le premier sommet du tracé dessiné est le point de la flèche : c'est ce qui fait qu'il n'y a
    // rien derrière elle, plutôt qu'une ligne masquée à une certaine opacité.
    expect(source).toContain("const rest = [snap.point];");
    expect(source).toContain("if (walked > snap.traveledMeters + 1) rest.push(line[i + 1]);");
  });
});
