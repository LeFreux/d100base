const { SchemaField, NumberField, StringField, BooleanField } = foundry.data.fields;

/* ---------------------------- */
/* ACTOR DATA MODEL */
/* ---------------------------- */

export class CharacterData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      injuryState: new StringField({ initial: "indemne" }),

      attributes: new SchemaField({
        corpsacorps: new NumberField({ integer: true, min: 0, max: 100, initial: 50 }),
        capacitedetir: new NumberField({ integer: true, min: 0, max: 100, initial: 50 }),
        force: new NumberField({ integer: true, min: 0, max: 100, initial: 50 }),
        agilite: new NumberField({ integer: true, min: 0, max: 100, initial: 50 }),
        intelligence: new NumberField({ integer: true, min: 0, max: 100, initial: 50 }),
        perception: new NumberField({ integer: true, min: 0, max: 100, initial: 50 }),
        stress: new NumberField({ integer: true, min: 0, max: 100, initial: 0 })
      }),

      notes: new StringField({ initial: "" })
    };
  }
}

/* ---------------------------- */
/* ITEM DATA MODEL */
/* ---------------------------- */

export class ObjectItemData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      category: new StringField({ initial: "Divers" }),

      weight: new NumberField({
        min: 0,
        initial: 0
      }),

      quantity: new NumberField({
        integer: true,
        min: 0,
        initial: 1
      }),

      description: new StringField({
        initial: ""
      }),

      container: new StringField({
        nullable: true,
        initial: null
      }),

      isContainer: new BooleanField({
        initial: false
      })

    };
  }

}