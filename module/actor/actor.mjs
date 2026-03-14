export class D100Actor extends Actor {
  async rollAttribute(attributeKey) {
    const attributeValue = this.system.attributes?.[attributeKey] ?? 0;

    const labels = {
      corpsacorps: "Corps-à-Corps",
      capacitedetir: "Capacité de Tir",
      force: "Force",
      agilite: "Agilité",
      intelligence: "Intelligence",
      perception: "Perception",
      stress: "Stress"
    };

    const roll = await (new Roll("1d100")).evaluate();
    const result = roll.total;

    let outcome = "Échec";
    if (result === 1) outcome = "Critique";
    else if (result <= attributeValue) outcome = "Réussite";
    else if (result >= 96) outcome = "Fumble";

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${labels[attributeKey] ?? attributeKey} (${attributeValue}%) → ${outcome}`
    });
  }
}