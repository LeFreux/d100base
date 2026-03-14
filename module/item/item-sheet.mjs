export class D100ItemSheet extends ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["d100base", "sheet", "item"],
      width: 520,
      height: 560
    });
  }

  get template() {
    return "systems/d100base/templates/item-sheet.hbs";
  }

  getData() {

    const context = super.getData();

    context.system = this.item.system;

    context.categories = [
      { value: "Arme", label: "Arme" },
      { value: "Artisanal", label: "Artisanal" },
      { value: "Conteneur", label: "Conteneur" },
      { value: "Divers", label: "Divers" },
      { value: "Électronique", label: "Électronique" },
      { value: "Livre", label: "Livre" },
      { value: "Loisir", label: "Loisir" },
      { value: "Lumière", label: "Lumière" },
      { value: "Munition", label: "Munition" },
      { value: "Médical", label: "Médical" },
      { value: "Nourriture", label: "Nourriture" },
      { value: "Outil", label: "Outil" },
      { value: "Protection", label: "Protection" },
      { value: "Quincaillerie", label: "Quincaillerie" },
      { value: "Vêtement", label: "Vêtement" }
    ];

    return context;
  }

}