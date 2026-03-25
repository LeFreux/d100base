const {
  SchemaField,
  NumberField,
  StringField,
  BooleanField
} = foundry.data.fields;

/* ---------------------------- */
/* CONSTANTES MÉTIER            */
/* ---------------------------- */

/**
 * États globaux actuels conservés pour compatibilité avec l’existant.
 * Ce champ reste distinct du futur système de blessures localisées.
 */
export const GLOBAL_INJURY_STATES = Object.freeze([
  "indemne",
  "legerement-blesse",
  "blesse",
  "gravement-blesse",
  "mourant",
  "inconscient"
]);

/**
 * États autorisés pour chaque membre du mannequin.
 */
export const LOCALIZED_WOUND_STATES = Object.freeze([
  "indemne",
  "blesse",
  "gravement-blesse",
  "inoperant",
  "perdu",
  "artificiel"
]);

/**
 * Clés techniques stables des 6 zones du corps.
 * L’affichage utilisateur doit être géré via les fichiers de langue.
 */
export const LOCALIZED_WOUND_PARTS = Object.freeze([
  "head",
  "torso",
  "rightArm",
  "leftArm",
  "rightLeg",
  "leftLeg"
]);

/**
 * Petit helper interne pour éviter de répéter les mêmes définitions.
 */
function createLocalizedWoundField() {
  return new StringField({
    initial: "indemne",
    choices: LOCALIZED_WOUND_STATES
  });
}

/* ---------------------------- */
/* ACTOR DATA MODEL             */
/* ---------------------------- */

export class CharacterData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      /* ---------------------------- */
      /* ETAT GLOBAL                  */
      /* ---------------------------- */

      /**
       * État général du personnage.
       * Conservé indépendamment des blessures localisées.
       */
      injuryState: new StringField({
        initial: "indemne",
        choices: GLOBAL_INJURY_STATES
      }),

      /* ---------------------------- */
      /* ATTRIBUTS                    */
      /* ---------------------------- */

      attributes: new SchemaField({
        corpsacorps: new NumberField({ integer: true, min: 5, max: 95, initial: 50 }),
        capacitedetir: new NumberField({ integer: true, min: 5, max: 95, initial: 50 }),
        force: new NumberField({ integer: true, min: 5, max: 95, initial: 50 }),
        agilite: new NumberField({ integer: true, min: 5, max: 95, initial: 50 }),
        intelligence: new NumberField({ integer: true, min: 5, max: 95, initial: 50 }),
        perception: new NumberField({ integer: true, min: 5, max: 95, initial: 50 }),
        stress: new NumberField({ integer: true, min: 5, max: 95, initial: 50 })
      }),

      /* ---------------------------- */
      /* INVENTAIRE                   */
      /* ---------------------------- */

      totalWeight: new NumberField({
        min: 0,
        initial: 0
      }),

      /* ---------------------------- */
      /* ONGLET DETAILS (PROFIL)      */
      /* ---------------------------- */

      details: new SchemaField({
        age: new NumberField({
          integer: true,
          min: 0,
          initial: 0
        }),

        height: new NumberField({
          min: 0,
          initial: 0
        }),

        weight: new NumberField({
          min: 0,
          initial: 0
        }),

        traits: new StringField({
          initial: ""
        }),

        aptitude: new StringField({
          initial: ""
        }),

        blessures: new StringField({
          initial: ""
        }),

        biographie: new StringField({
          initial: ""
        })
      }),

      /* ---------------------------- */
      /* ONGLET JOURNAL (JOUEUR)      */
      /* ---------------------------- */

      journal: new SchemaField({
        npcs: new StringField({
          initial: ""
        }),

        factions: new StringField({
          initial: ""
        }),

        notes: new StringField({
          initial: ""
        })
      }),

      /* ---------------------------- */
      /* ONGLET STATE                 */
      /* ---------------------------- */

      state: new SchemaField({
        /**
         * Champ texte libre existant conservé.
         * Peut servir à une synthèse ou à des notes d’état.
         */
        injuries: new StringField({
          initial: ""
        }),

        /**
         * Champ texte libre existant conservé.
         */
        equipment: new StringField({
          initial: ""
        }),

        /**
         * Nouveau système de blessures localisées.
         * Chaque membre est stocké séparément avec une valeur contrôlée.
         */
        localizedWounds: new SchemaField({
          head: createLocalizedWoundField(),
          torso: createLocalizedWoundField(),
          rightArm: createLocalizedWoundField(),
          leftArm: createLocalizedWoundField(),
          rightLeg: createLocalizedWoundField(),
          leftLeg: createLocalizedWoundField()
        })
      })
    };
  }
}

/* ---------------------------- */
/* ITEM DATA MODEL              */
/* ---------------------------- */

/**
 * Règle de domaine :
 * - un conteneur ne stocke pas son contenu dans son propre system data ;
 * - le contenu réel d’un conteneur est dérivé des items embarqués de l’acteur
 *   dont system.containerId === id du conteneur ;
 * - container est conservé temporairement comme champ legacy pour migration.
 */
export class ObjectItemData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      /* ---------------------------- */
      /* IDENTITÉ / CLASSEMENT        */
      /* ---------------------------- */

      category: new StringField({
        initial: "Divers"
      }),

      description: new StringField({
        initial: ""
      }),

      /* ---------------------------- */
      /* QUANTITÉ / POIDS             */
      /* ---------------------------- */

      quantity: new NumberField({
        integer: true,
        min: 0,
        initial: 1
      }),

      unitWeight: new NumberField({
        min: 0,
        initial: 0
      }),

      /**
       * Poids calculé/stocké pour affichage runtime.
       * - item simple : unitWeight * quantity
       * - conteneur : poids total dérivé côté acteur
       */
      weight: new NumberField({
        min: 0,
        initial: 0
      }),

      /* ---------------------------- */
      /* RELATION DE CONTENEUR        */
      /* ---------------------------- */

      /**
       * Champ legacy conservé transitoirement pour migration.
       * À normaliser vers containerId dès l’initialisation / migration.
       */
      container: new StringField({
        nullable: true,
        initial: null
      }),

      /**
       * Source de vérité runtime pour la relation parent/enfant.
       * null = item à la racine de l’inventaire.
       */
      containerId: new StringField({
        nullable: true,
        initial: null
      }),

      /**
       * État d’ouverture UI d’un conteneur dans l’arbre d’inventaire.
       */
      expanded: new BooleanField({
        initial: true
      }),

      /* ---------------------------- */
      /* PROPRIÉTÉS DE CONTENEUR      */
      /* ---------------------------- */

      isContainer: new BooleanField({
        initial: false
      }),

      /**
       * Poids propre du conteneur vide.
       */
      emptyWeight: new NumberField({
        min: 0,
        initial: 0
      }),

      /**
       * Capacité maximale en poids du contenu transporté.
       * 0 peut être interprété comme "pas de capacité définie".
       */
      capacityWeight: new NumberField({
        min: 0,
        initial: 0
      }),

      /* ---------------------------- */
      /* MÉTADONNÉES DE FUSION        */
      /* ---------------------------- */

      /**
       * Conservé pour compatibilité avec l’existant.
       * La logique métier de fusion sera centralisée ailleurs.
       */
      merged: new BooleanField({
        initial: false
      }),

      /**
       * Identifiant logique de groupe de fusion.
       */
      mergeGroupId: new StringField({
        nullable: true,
        initial: null
      })
    };
  }

  /**
   * Helper utilitaire transitoire.
   * Permet d’obtenir l’identifiant du conteneur "effectif" tant que
   * l’ancien champ legacy `container` existe encore dans certaines données.
   */
  static getContainerId(system = {}) {
    return system.containerId ?? system.container ?? null;
  }

  /**
   * Helper utilitaire simple pour le code appelant.
   */
  static isContained(system = {}) {
    return !!this.getContainerId(system);
  }
}