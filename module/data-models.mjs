const {
  SchemaField,
  NumberField,
  StringField,
  BooleanField,
  ArrayField
} = foundry.data.fields;

/* ---------------------------- */
/* ACTOR DATA MODEL             */
/* ---------------------------- */

export class CharacterData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      injuryState: new StringField({
        initial: "indemne"
      }),

      attributes: new SchemaField({
        corpsacorps: new NumberField({ integer: true, min: 5, max: 95, initial: 50 }),
        capacitedetir: new NumberField({ integer: true, min: 5, max: 95, initial: 50 }),
        force: new NumberField({ integer: true, min: 5, max: 95, initial: 50 }),
        agilite: new NumberField({ integer: true, min: 5, max: 95, initial: 50 }),
        intelligence: new NumberField({ integer: true, min: 5, max: 95, initial: 50 }),
        perception: new NumberField({ integer: true, min: 5, max: 95, initial: 50 }),
        stress: new NumberField({ integer: true, min: 5, max: 95, initial: 50 })
      }),

      totalWeight: new NumberField({
        min: 0,
        initial: 0
      }),

      notes: new StringField({
        initial: ""
      })
    };
  }
}

/* ---------------------------- */
/* ITEM DATA MODEL              */
/* ---------------------------- */

export class ObjectItemData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      category: new StringField({
        initial: "Divers"
      }),

      quantity: new NumberField({
        integer: true,
        min: 0,
        initial: 1
      }),

      unitWeight: new NumberField({
        min: 0,
        initial: 0
      }),

      weight: new NumberField({
        min: 0,
        initial: 0
      }),

      description: new StringField({
        initial: ""
      }),

      /**
       * Ancien champ legacy.
       * On le garde pour ne pas casser les anciennes fiches/données.
       */
      container: new StringField({
        nullable: true,
        initial: null
      }),

      /**
       * Nouveau champ canonique utilisé par l'inventaire acteur récursif.
       */
      containerId: new StringField({
        nullable: true,
        initial: null
      }),

      /**
       * État d'ouverture du conteneur dans la fiche acteur.
       */
      expanded: new BooleanField({
        initial: true
      }),

      isContainer: new BooleanField({
        initial: false
      }),

      emptyWeight: new NumberField({
        min: 0,
        initial: 0
      }),

      capacityWeight: new NumberField({
        min: 0,
        initial: 0
      }),

      defaultContents: new ArrayField(
        new SchemaField({
          name: new StringField({ initial: "" }),
          quantity: new NumberField({ integer: true, min: 0, initial: 1 }),
          weight: new NumberField({ min: 0, initial: 0 }),
          unitWeight: new NumberField({ min: 0, initial: 0 }),
          category: new StringField({ initial: "Divers" }),
          description: new StringField({ initial: "" }),
          img: new StringField({ initial: "icons/svg/item-bag.svg" }),
          uuid: new StringField({ nullable: true, initial: null }),
          sourceId: new StringField({ nullable: true, initial: null })
        })
      )
    };
  }
}