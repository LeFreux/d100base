import {
  LOCALIZED_WOUND_PARTS,
  LOCALIZED_WOUND_STATES
} from "../data-models.mjs";

export class D100ActorSheet extends ActorSheet {

  constructor(...args) {
    super(...args);

    this._sortState = {
      field: null,
      direction: null
    };

    this._collapsedAptitudes = new Set();
  }

  /* ===================================== */
  /* OPTIONS                               */
  /* ===================================== */

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["d100base", "sheet", "actor"],
      template: "systems/d100base/templates/actor-sheet.hbs",
      width: 1000,
      height: 700,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-content",
          initial: "main"
        }
      ]
    });
  }
  
  get title() {
    return this.actor?.name ?? super.title;
  }

  /* ===================================== */
  /* DATA                                  */
  /* ===================================== */

  async getData() {
    const data = await super.getData();

    data.system = this.actor.system;

    data.permissions = {
      isOwner: this.actor.isOwner,
      isObserver: !this.actor.isOwner && this.actor.testUserPermission(game.user, "OBSERVER"),
      isLimited: this.actor.limited,
      isEditable: this.isEditable
    };

    data.config = {
      attributes: {
        corpsacorps: "D100BASE.Attributes.corpsacorps",
        capacitedetir: "D100BASE.Attributes.capacitedetir",
        force: "D100BASE.Attributes.force",
        agilite: "D100BASE.Attributes.agilite",
        intelligence: "D100BASE.Attributes.intelligence",
        perception: "D100BASE.Attributes.perception",
        stress: "D100BASE.Attributes.stress"
      },

      attributesShort: {
        corpsacorps: "CC",
        capacitedetir: "CT",
        force: "F",
        agilite: "A",
        intelligence: "I",
        perception: "P",
        stress: "S"
      }
    };

    let tree = this.actor.getInventoryTree();

    if (this._sortState.field && this._sortState.direction) {
      this._sortNodes(tree);
    }

    data.inventoryTree = tree;

    data.sortState = {
      field: this._sortState.field,
      direction: this._sortState.direction,
      icons: {
        name: this._getSortIcon("name"),
        type: this._getSortIcon("type"),
        quantity: this._getSortIcon("quantity"),
        weight: this._getSortIcon("weight")
      }
    };

	data.showToken = this.actor.getFlag("d100base", "showToken") ?? false;
	data.tokenImg = this.actor.prototypeToken?.texture?.src || this.actor.img;

	data.aptitudesCards = this._prepareAptitudesCards(data.system?.details?.aptitude ?? "");
	data.hasAptitudesCards = data.aptitudesCards.length > 0;

	/* ------------------------------------- */
	/* BLESSURES LOCALISÉES                  */
	/* ------------------------------------- */

	const localizedWounds = this._getLocalizedWoundsSnapshot();

	data.localizedWounds = localizedWounds;
	data.localizedWoundStates = this._getLocalizedWoundStateOptions();
	data.localizedWoundParts = this._prepareLocalizedWoundParts(localizedWounds);
	data.localizedWoundLegend = this._prepareLocalizedWoundLegend();
	data.localizedWoundsSvg = await this._buildLocalizedWoundsSvg(localizedWounds);

    return data;
  }

  /* ===================================== */
  /* APTITUDES                             */
  /* ===================================== */

  _prepareAptitudesCards(rawText) {
    if (!rawText?.trim()) return [];

    return rawText
      .split(/\n\s*\n+/)
      .map((entry, index) => {
        const normalized = entry.trim();
        const match = normalized.match(/^(.+?)\s:\s([\s\S]*)$/);

        const id = `aptitude-${index}`;
        const name = match ? match[1].trim() : normalized;
        const description = match ? match[2].trim() : "";

        return {
          id,
          name,
          description,
          collapsed: this._collapsedAptitudes.has(id)
        };
      })
      .filter(entry => entry.name.length);
  }
  

  _initializeAptitudeCards(html) {
    html.find(".aptitude-card").each((_, element) => {
      const wrap = element.querySelector(".aptitude-card-body-wrap");
      const body = element.querySelector(".aptitude-card-body");
      if (!wrap || !body) return;

      if (element.classList.contains("collapsed")) {
        wrap.style.height = "0px";
        wrap.style.opacity = "0";
      } else {
        wrap.style.height = "auto";
        wrap.style.opacity = "1";
      }
    });
  }

  _toggleAptitudeCard(card) {
    if (!card) return;

    const wrap = card.querySelector(".aptitude-card-body-wrap");
    const body = card.querySelector(".aptitude-card-body");
    const toggle = card.querySelector(".aptitude-card-toggle");
    const aptitudeId = card.dataset.aptitudeId;

    if (!wrap || !body) return;

    const isCollapsed = card.classList.contains("collapsed");

    if (isCollapsed) {
      card.classList.remove("collapsed");
      toggle?.setAttribute("aria-expanded", "true");
      if (aptitudeId) this._collapsedAptitudes.delete(aptitudeId);

      wrap.style.height = "0px";
      wrap.style.opacity = "0";

      requestAnimationFrame(() => {
        wrap.style.height = `${body.scrollHeight}px`;
        wrap.style.opacity = "1";
      });

      const onExpandEnd = (event) => {
        if (event.propertyName !== "height") return;
        wrap.style.height = "auto";
        wrap.removeEventListener("transitionend", onExpandEnd);
      };

      wrap.addEventListener("transitionend", onExpandEnd);
      return;
    }

    wrap.style.height = `${body.scrollHeight}px`;
    wrap.style.opacity = "1";

    requestAnimationFrame(() => {
      card.classList.add("collapsed");
      toggle?.setAttribute("aria-expanded", "false");
      if (aptitudeId) this._collapsedAptitudes.add(aptitudeId);

      wrap.style.height = "0px";
      wrap.style.opacity = "0";
    });
  }

  async _openAddAptitudeDialog() {
    if (!this.isEditable) return false;

    const content = `
      <form class="aptitude-dialog">
        <div class="form-group">
		  <label>${game.i18n.localize("D100BASE.Actor.AptitudeName")}</label>
          <input type="text" name="aptitude-name">
        </div>

        <div class="form-group">
		  <label>${game.i18n.localize("D100BASE.Actor.AptitudeDescription")}</label>
          <textarea name="aptitude-description" rows="5"></textarea>
        </div>
      </form>
    `;

    return new Promise(resolve => {
      new Dialog({
		title: game.i18n.localize("D100BASE.Actor.AptitudeAdd"),
        content,
        buttons: {
          save: {
            icon: '<i class="fas fa-check"></i>',
            label: game.i18n.localize("D100BASE.Common.Save"),
            callback: async html => {
              const name = String(html.find('[name="aptitude-name"]').val() ?? "").trim();
              const description = String(html.find('[name="aptitude-description"]').val() ?? "").trim();

              if (!name) {
			    ui.notifications.warn(game.i18n.localize("D100BASE.Actor.AptitudeNameRequired"));
                resolve(false);
                return;
              }

              const newEntry = `${name} : ${description}`;
              const currentRaw = String(this.actor.system?.details?.aptitude ?? "").trim();
              const nextRaw = currentRaw ? `${currentRaw}\n\n${newEntry}` : newEntry;

              await this.actor.update({
                "system.details.aptitude": nextRaw
              });

              resolve(true);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("D100BASE.Common.Cancel"),
            callback: () => resolve(false)
          }
        },
        default: "save",
        render: html => {
          html.find('[name="aptitude-name"]').trigger("focus");
        },
        close: () => resolve(false)
      }).render(true);
    });
  } 

  async _openEditAptitudeDialog(aptitudeId) {
    if (!this.isEditable) return;

    const raw = this.actor.system?.details?.aptitude ?? "";
    const cards = this._prepareAptitudesCards(raw);

    const target = cards.find(c => c.id === aptitudeId);
    if (!target) return;

    const content = `
      <form class="aptitude-dialog">
        <div class="form-group">
          <label>${game.i18n.localize("D100BASE.Actor.AptitudeName")}</label>
          <input type="text" name="aptitude-name" value="${target.name}">
        </div>

        <div class="form-group">
          <label>${game.i18n.localize("D100BASE.Actor.AptitudeDescription")}</label>
          <textarea name="aptitude-description" rows="5">${target.description}</textarea>
        </div>
      </form>
    `;

    new Dialog({
      title: game.i18n.localize("D100BASE.Actor.AptitudeAdd"),
      content,

      buttons: {
        save: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize("D100BASE.Common.Save"),
          callback: async html => {
            const name = html.find('[name="aptitude-name"]').val().trim();
            const desc = html.find('[name="aptitude-description"]').val().trim();

            if (!name) {
              ui.notifications.warn(game.i18n.localize("D100BASE.Actor.AptitudeNameRequired"));
              return;
            }

            target.name = name;
            target.description = desc;

            await this._saveAptitudes(cards);
          }
        },

        delete: {
          icon: '<i class="fas fa-trash"></i>',
          label: "Supprimer",
          callback: async () => {
            const filtered = cards.filter(c => c.id !== aptitudeId);
            await this._saveAptitudes(filtered);
          }
        },

        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("D100BASE.Common.Cancel")
        }
      }
    }).render(true);
  }  
  
  async _saveAptitudes(cards) {
    const text = cards
      .map(c => `${c.name} : ${c.description}`)
      .join("\n\n");

    await this.actor.update({
      "system.details.aptitude": text
    });
  }
  
  async openStateTab() {
    await this.render(true);

    if (this._tabs?.[0]?.activate) {
      this._tabs[0].activate("state");
      return;
    }

    const nav = this.element?.find('.sheet-tabs.tabs [data-tab="state"]');
    if (nav?.length) nav[0].click();
  }

  /* ===================================== */
  /* LOCALISATION UI                       */
  /* ===================================== */

  _localize(key, fallback = "") {
    const localized = game.i18n?.localize?.(key);
    if (localized && localized !== key) return localized;
    return fallback || key;
  }

  _format(key, data = {}, fallback = "") {
    const formatted = game.i18n?.format?.(key, data);
    if (formatted && formatted !== key) return formatted;
    return fallback || key;
  }

  _escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
  
  /* ===================================== */
  /* BLESSURES LOCALISÉES - DATA           */
  /* ===================================== */

  _getFallbackLocalizedWounds() {
    return {
      head: "indemne",
      torso: "indemne",
      rightArm: "indemne",
      leftArm: "indemne",
      rightLeg: "indemne",
      leftLeg: "indemne"
    };
  }

  _getLocalizedWoundsSnapshot() {
    const fallback = this._getFallbackLocalizedWounds();
    const source = this.actor.system?.state?.localizedWounds ?? {};

    return {
      head: source.head ?? fallback.head,
      torso: source.torso ?? fallback.torso,
      rightArm: source.rightArm ?? fallback.rightArm,
      leftArm: source.leftArm ?? fallback.leftArm,
      rightLeg: source.rightLeg ?? fallback.rightLeg,
      leftLeg: source.leftLeg ?? fallback.leftLeg
    };
  }

  _getPartLabelKey(partKey) {
    const map = {
      head: "D100BASE.WoundParts.Head",
      torso: "D100BASE.WoundParts.Torso",
      rightArm: "D100BASE.WoundParts.RightArm",
      leftArm: "D100BASE.WoundParts.LeftArm",
      rightLeg: "D100BASE.WoundParts.RightLeg",
      leftLeg: "D100BASE.WoundParts.LeftLeg"
    };

    return map[partKey] ?? partKey;
  }

  _getLocalizedWoundStateLabelKey(stateKey) {
    const map = {
      indemne: "D100BASE.WoundStates.Indemne",
      blesse: "D100BASE.WoundStates.Blesse",
      "gravement-blesse": "D100BASE.WoundStates.GravementBlesse",
      inoperant: "D100BASE.WoundStates.Inoperant",
      perdu: "D100BASE.WoundStates.Perdu",
      artificiel: "D100BASE.WoundStates.Artificiel"
    };

    return map[stateKey] ?? stateKey;
  }

  _getLocalizedWoundStateCssClass(stateKey) {
    const normalized = LOCALIZED_WOUND_STATES.includes(stateKey)
      ? stateKey
      : "indemne";

    return `state-${normalized}`;
  }

  _getLocalizedWoundStateOptions() {
    return LOCALIZED_WOUND_STATES.map(stateKey => ({
      value: stateKey,
      label: game.i18n.localize(this._getLocalizedWoundStateLabelKey(stateKey)),
      cssClass: this._getLocalizedWoundStateCssClass(stateKey)
    }));
  }

  _prepareLocalizedWoundParts(localizedWounds = {}) {
    return LOCALIZED_WOUND_PARTS.map(partKey => {
      const stateKey = localizedWounds[partKey] ?? "indemne";
      const label = game.i18n.localize(this._getPartLabelKey(partKey));
      const stateLabel = game.i18n.localize(this._getLocalizedWoundStateLabelKey(stateKey));

      return {
        key: partKey,
        label,
        state: stateKey,
        stateLabel,
        cssClass: this._getLocalizedWoundStateCssClass(stateKey),
        partClass: `part-${partKey}`,
        title: `${label} : ${stateLabel}`
      };
    });
  }

  _prepareLocalizedWoundLegend() {
    return this._getLocalizedWoundStateOptions().map(entry => ({
      ...entry
    }));
  }

  async _buildLocalizedWoundsSvg(localizedWounds = {}) {
    const response = await fetch("systems/d100base/assets/svg/body.svg");
    const rawSvg = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawSvg, "image/svg+xml");
    const svg = doc.documentElement;

    svg.classList.add("localized-wounds-svg");

    for (const partKey of LOCALIZED_WOUND_PARTS) {
      const node = svg.querySelector(`[data-part="${partKey}"], #${partKey}`);
      if (!node) continue;

      const stateKey = localizedWounds[partKey] ?? "indemne";
      const partLabel = game.i18n.localize(this._getPartLabelKey(partKey));
      const stateLabel = game.i18n.localize(this._getLocalizedWoundStateLabelKey(stateKey));

      node.setAttribute("data-part", partKey);
      node.setAttribute("data-state", stateKey);
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", `${partLabel} : ${stateLabel}`);
      node.setAttribute("title", `${partLabel} : ${stateLabel}`);
      node.classList.add("localized-wound-svg-part");
    }

    return new XMLSerializer().serializeToString(svg);
  }

  /* ===================================== */
  /* SORT                                  */
  /* ===================================== */

  _sortNodes(nodes) {
    const { field, direction } = this._sortState;
    const factor = direction === "asc" ? 1 : -1;

    nodes.sort((a, b) => {
      switch (field) {
        case "name":
          return (a.name || "").localeCompare(b.name || "") * factor;

        case "type":
          return (a.system?.category || "").localeCompare(b.system?.category || "") * factor;

        case "quantity":
          return ((Number(a.system?.quantity ?? 0)) - (Number(b.system?.quantity ?? 0))) * factor;

        case "weight":
          return ((Number(a.system?.weight ?? 0)) - (Number(b.system?.weight ?? 0))) * factor;

        default:
          return 0;
      }
    });

    for (const node of nodes) {
      if (node.contents?.length) this._sortNodes(node.contents);
    }
  }

  _toggleSort(field) {
    if (this._sortState.field !== field) {
      this._sortState.field = field;
      this._sortState.direction = "asc";
      return;
    }

    if (this._sortState.direction === "asc") {
      this._sortState.direction = "desc";
      return;
    }

    if (this._sortState.direction === "desc") {
      this._sortState.field = null;
      this._sortState.direction = null;
      return;
    }

    this._sortState.direction = "asc";
  }

  /* ===================================== */
  /* HELPERS UI                            */
  /* ===================================== */

  /**
   * Tente de retrouver le token contexte de la fiche.
   *
   * Priorité :
   * 1. acteur synthétique / token actor
   * 2. un unique token contrôlé correspondant à cet acteur
   * 3. null si ambigu ou absent
   */
  _getInitiativeTokenContext() {
    const syntheticToken = this.actor?.token?.object ?? this.actor?.token ?? null;
    if (syntheticToken) {
      return syntheticToken;
    }

    const controlled = canvas?.tokens?.controlled ?? [];
    const matching = controlled.filter(token => token?.actor?.id === this.actor.id);

    if (matching.length === 1) {
      return matching[0];
    }

    return null;
  }

  _getTransferSourceTokenContext() {
    return this._getInitiativeTokenContext();
  }

  _hasMinimumTransferPermission(actor, minimumLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED) {
    if (!actor || !game.user) return false;
    return actor.testUserPermission(game.user, minimumLevel);
  }

  _getSceneTokensForActor(actor) {
    const placeables = canvas?.tokens?.placeables ?? [];
    return placeables.filter(token => token?.actor?.id === actor.id);
  }

  _isTokenVisibleForTransfer(sourceToken, targetToken) {
    if (!sourceToken || !targetToken) return false;
    if (sourceToken.id === targetToken.id) return false;

    if (!targetToken.visible) return false;

    // Version simple et robuste :
    // on considère visible si le token cible est actuellement visible pour l'utilisateur.
    // Plus tard, on pourra raffiner vers une vraie vérification LOS / perception.
    return true;
  }

  _canActorBeTransferTargetFromSourceToken(actor, sourceToken, minimumPermissionLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED) {
    if (!actor || !sourceToken) return false;
    if (actor.id === this.actor.id) return false;

    if (!this._hasMinimumTransferPermission(actor, minimumPermissionLevel)) {
      return false;
    }

    const sceneTokens = this._getSceneTokensForActor(actor);
    if (!sceneTokens.length) return false;

    return sceneTokens.some(targetToken => this._isTokenVisibleForTransfer(sourceToken, targetToken));
  }

  _getItemIdFromEventTarget(target) {
    return target?.closest?.(".item")?.dataset?.itemId ?? null;
  }

  _getTransferableItemFromEventTarget(target) {
    const itemId = this._getItemIdFromEventTarget(target);
    if (!itemId) return null;

    const item = this.actor.getInventoryItem(itemId);
    if (!item) return null;

    return item;
  }

  _getAvailableTransferTargets() {
    const sourceToken = this._getTransferSourceTokenContext();

    if (!sourceToken) {
      return [];
    }

    return game.actors
      .filter(actor => actor?.id && actor.id !== this.actor.id)
      .filter(actor => actor.type === this.actor.type)
      .filter(actor => this._canActorBeTransferTargetFromSourceToken(
        actor,
        sourceToken,
        CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED		// Échange uniquement avec acteur dont le joueur possède à minima droits "Limité"
      ));
  }

  _buildTransferTargetOptionsHtml(targetActors = []) {
    return targetActors
      .map(actor => `<option value="${actor.id}">${this._escapeHtml(actor.name || actor.id)}</option>`)
      .join("");
  }

  _getDraggedItemIdFromEvent(event) {
    const dt = event.originalEvent?.dataTransfer || event.dataTransfer;
    if (!dt) return null;
    return dt.getData("text/plain") || null;
  }

  _getDragTransfer(event) {
    return event.originalEvent?.dataTransfer || event.dataTransfer || null;
  }

  _getTargetItemFromDropEvent(event) {
    const targetLi = event.currentTarget?.closest?.(".item") || event.currentTarget;
    const targetId = targetLi?.dataset?.itemId;
    if (!targetId) return null;
    return this.actor.getInventoryItem(targetId);
  }

  _getSortIcon(field) {
    if (this._sortState.field !== field || !this._sortState.direction) {
      return "▶";
    }

    return this._sortState.direction === "asc" ? "▲" : "▼";
  }

  async _openTransferInventoryDialog(item) {
    if (!this.isEditable || !item) return false;

    const sourceToken = this._getTransferSourceTokenContext();
    if (!sourceToken) {
      ui.notifications?.warn(
        this._localize(
          "D100BASE.Inventory.NoTransferSourceToken",
          "Aucun token source valide n’est disponible pour ce transfert."
        )
      );
      return false;
    }

    const targetActors = this._getAvailableTransferTargets();

    if (!targetActors.length) {
      ui.notifications?.warn(
        this._localize(
          "D100BASE.Inventory.NoTransferTarget",
          "Aucun acteur cible visible et autorisé n’est disponible pour ce transfert."
        )
      );
      return false;
    }

    const content = `
      <form class="inventory-transfer-dialog">
        <div class="form-group">
          <label>Objet transféré</label>
          <input type="text" value="${this._escapeHtml(item.name || item.id)}" readonly>
        </div>

        <div class="form-group">
          <label>Acteur cible visible</label>
          <select name="target-actor-id">
            ${this._buildTransferTargetOptionsHtml(targetActors)}
          </select>
        </div>
      </form>
    `;

    return new Promise(resolve => {
      new Dialog({
        title: this._localize("D100BASE.Inventory.TransferTitle", "Transférer un objet"),
        content,
        buttons: {
          transfer: {
            icon: '<i class="fas fa-share"></i>',
            label: this._localize("D100BASE.Inventory.TransferButton", "Transférer"),
            callback: async html => {
              const targetActorId = String(html.find('[name="target-actor-id"]').val() ?? "").trim();
              if (!targetActorId) {
                ui.notifications?.warn(
                  this._localize("D100BASE.Inventory.NoTransferTargetSelected", "Aucun acteur cible sélectionné.")
                );
                resolve(false);
                return;
              }

              const targetActor = game.actors.get(targetActorId);
              if (!targetActor) {
                ui.notifications?.warn(
                  this._localize("D100BASE.Inventory.TransferTargetNotFound", "Acteur cible introuvable.")
                );
                resolve(false);
                return;
              }

              const sourceToken = this._getTransferSourceTokenContext();

              const result = await this.actor.transferInventoryItemToActorRoot(
                item.id,
                targetActor,
                { sourceToken }
              );

              if (!result?.success) {
                resolve(false);
                return;
              }

              ui.notifications?.info(
                this._format(
                  "D100BASE.Inventory.TransferSuccess",
                  { actor: targetActor.name },
                  `Transfert effectué vers ${targetActor.name}.`
                )
              );
              resolve(true);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("D100BASE.Common.Cancel"),
            callback: () => resolve(false)
          }
        },
        default: "transfer",
        render: html => {
          html.find('[name="target-actor-id"]').trigger("focus");
        },
        close: () => resolve(false)
      }).render(true);
    });
  }

  async _onTransferInventoryItem(event) {
    event.preventDefault();
    event.stopPropagation();

    const item = this._getTransferableItemFromEventTarget(event.currentTarget);
    if (!item) return false;

    return this._openTransferInventoryDialog(item);
  }

  /* ===================================== */
  /* DIALOG OPTIONS DE JET                 */
  /* ===================================== */

  async _openRollOptionsDialog() {
    const content = `
      <form class="d100base-roll-options-dialog">
        <div class="form-group">
          <label>Bonus / Malus</label>
          <input type="number" name="modifier" value="0" step="1">
          <p class="notes">
            Bonus = abaisse la cible, malus = augmente la cible.
          </p>
        </div>

        <div class="form-group">
          <label>Mode</label>
          <select name="mode">
            <option value="normal">Normal</option>
            <option value="advantage">Avantage</option>
            <option value="disadvantage">Désavantage</option>
          </select>
        </div>
      </form>
    `;

    return new Promise(resolve => {
      new Dialog({
        title: "Options de jet",
        content,
        buttons: {
          confirm: {
            icon: '<i class="fas fa-check"></i>',
            label: game.i18n.localize("D100BASE.Common.Save"),
            callback: html => {
              const modifier = Number(html.find('[name="modifier"]').val() ?? 0) || 0;
              const mode = String(html.find('[name="mode"]').val() ?? "normal");

              resolve({
                modifier,
                mode
              });
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("D100BASE.Common.Cancel"),
            callback: () => resolve(null)
          }
        },
        default: "confirm",
        render: html => {
          html.find('[name="modifier"]').trigger("focus");
          html.find('[name="modifier"]').trigger("select");
        },
        close: () => resolve(null)
      }).render(true);
    });
  }

  async _resolveRollOptionsFromEvent(event) {
    if (!event?.ctrlKey) {
      return {
        modifier: 0,
        mode: "normal"
      };
    }

    return this._openRollOptionsDialog();
  }

  /* ===================================== */
  /* DIALOG BLESSURES LOCALISÉES           */
  /* ===================================== */

  async _onLocalizedWoundPartClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!this.isEditable) return;

    const partKey = event.currentTarget?.dataset?.part || event.currentTarget?.id;
    if (!partKey) return;
    if (!LOCALIZED_WOUND_PARTS.includes(partKey)) return;

    await this._openLocalizedWoundDialog(partKey);
  }

  async _updateLocalizedWound(partKey, stateKey) {
    if (!LOCALIZED_WOUND_PARTS.includes(partKey)) return false;
    if (!LOCALIZED_WOUND_STATES.includes(stateKey)) return false;

    await this.actor.update({
      [`system.state.localizedWounds.${partKey}`]: stateKey
    });

    return true;
  }

  async _openLocalizedWoundDialog(partKey) {
    if (!LOCALIZED_WOUND_PARTS.includes(partKey)) return;

    const currentState = this._getLocalizedWoundsSnapshot()[partKey] ?? "indemne";
    const partLabel = game.i18n.localize(this._getPartLabelKey(partKey));
    const stateOptions = this._getLocalizedWoundStateOptions();

    const optionsHtml = stateOptions.map(option => `
      <option value="${option.value}" ${option.value === currentState ? "selected" : ""}>
        ${option.label}
      </option>
    `).join("");

    const content = `
      <form class="localized-wound-dialog">
        <div class="form-group">
          <label>${game.i18n.localize("D100BASE.Dialogs.LocalizedWoundState")}</label>
          <select name="localized-wound-state">
            ${optionsHtml}
          </select>
        </div>
      </form>
    `;

    return new Promise(resolve => {
      new Dialog({
        title: `${game.i18n.localize("D100BASE.Dialogs.LocalizedWoundTitle")} — ${partLabel}`,
        content,
        buttons: {
          save: {
            icon: '<i class="fas fa-check"></i>',
            label: game.i18n.localize("D100BASE.Common.Save"),
            callback: async html => {
              const stateKey = html.find('[name="localized-wound-state"]').val();
              const success = await this._updateLocalizedWound(partKey, stateKey);
              resolve(success);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("D100BASE.Common.Cancel"),
            callback: () => resolve(false)
          }
        },
        default: "save",
        render: html => {
          html.find('[name="localized-wound-state"]').focus();
        },
        close: () => resolve(false)
      }).render(true);
    });
  }

  /* ===================================== */
  /* DRAG & DROP MÉTIER                    */
  /* ===================================== */

  /**
   * Détermine où rattacher l'item déplacé :
   * - drop sur un conteneur => dans ce conteneur
   * - drop sur un item simple => dans le même conteneur que lui
   */
  _resolveDropTargetContainerId(targetItem) {
    if (!targetItem) return null;
    if (targetItem.system?.isContainer) return targetItem.id;
    return this.actor.getEffectiveContainerId(targetItem);
  }

  async _handleInventoryDrop(event) {
    event.preventDefault();

    const draggedId = this._getDraggedItemIdFromEvent(event);
    const targetItem = this._getTargetItemFromDropEvent(event);

    if (!draggedId || !targetItem) return;

    const draggedItem = this.actor.getInventoryItem(draggedId);

    // On ignore ici tout drop externe : cette méthode reste réservée
    // au drag & drop interne de l'inventaire de l'acteur courant.
    if (!draggedItem) return;
    if (draggedItem.id === targetItem.id) return;

    const targetContainerId = this._resolveDropTargetContainerId(targetItem);

    await this.actor.tryStackOrMoveItem(
      draggedItem.id,
      targetItem?.id ?? null,
      targetContainerId
    );
  }
  
  async _onRollInitiative(event) {
    event.preventDefault();

    const button = event.currentTarget;
    if (!button) return;

    const options = await this._resolveRollOptionsFromEvent(event);
    if (!options) return;

    button.disabled = true;

    try {
      const tokenContext = this._getInitiativeTokenContext();

      await this.actor.rollInitiative({
        token: tokenContext,
        modifier: options.modifier,
        mode: options.mode
      });
    } catch (err) {
      console.error("D100 Base | Erreur lancement initiative depuis la fiche acteur", err);
      ui.notifications?.error("Erreur pendant le lancement de l’initiative. Consulte la console.");
    } finally {
      button.disabled = false;
    }
  }

  /* ===================================== */
  /* LISTENERS                             */
  /* ===================================== */

  activateListeners(html) {
    super.activateListeners(html);

    this._initializeAptitudeCards(html);

    /* ROLL */
    html.find("[data-roll]").click(async ev => {
      const key = ev.currentTarget.dataset.roll;
      if (!key) return;

      const options = await this._resolveRollOptionsFromEvent(ev);
      if (!options) return;

      await this.actor.rollAttribute(key, {
        modifier: options.modifier,
        mode: options.mode
      });
    });
	
    /* INITIATIVE */
    html.find('[data-action="roll-initiative"]').click(async ev => {
      await this._onRollInitiative(ev);
    });

    /* TOGGLE PORTRAIT / TOKEN */
    html.find(".toggle-portrait").click(async (ev) => {
      ev.preventDefault();

      const current = this.actor.getFlag("d100base", "showToken") ?? false;
      await this.actor.setFlag("d100base", "showToken", !current);
    });

    /* TOGGLE APTITUDES */
    html.on("click", ".aptitude-card-toggle", ev => {
	  ev.preventDefault();
	  const card = ev.currentTarget.closest(".aptitude-card");
	  this._toggleAptitudeCard(card);
	});

	/* EDIT APTITUDE */
	html.on("click", ".aptitude-card-edit", ev => {
	  ev.preventDefault();
	  ev.stopPropagation();

	  const id = ev.currentTarget.dataset.aptitudeId;
	  this._openEditAptitudeDialog(id);
	});

    /* BLESSURES LOCALISÉES */
	html.on("click", ".localized-wound-svg-part", async ev => {
      if (!this.isEditable) return;
      await this._onLocalizedWoundPartClick(ev);
    });

    html.on("keydown", ".localized-wound-svg-part", async ev => {
      if (!this.isEditable) return;
      if (ev.key !== "Enter" && ev.key !== " ") return;

      ev.preventDefault();
      await this._onLocalizedWoundPartClick(ev);
    });

	if (!this.isEditable) return;

	/* AJOUTER UNE APTITUDE */
	html.find(".aptitude-add-card").click(async ev => {
	  ev.preventDefault();
	  await this._openAddAptitudeDialog();
	});

	/* OPEN ITEM */
	const inventoryItemSelector = ".inventory-list .item";

    html.find(inventoryItemSelector).dblclick(ev => {
      const id = ev.currentTarget.dataset.itemId;
      const item = this.actor.getInventoryItem(id);
      if (item) item.sheet.render(true);
    });

    /* TOGGLE CONTAINER */
    html.find(".container-toggle").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();

      const id = ev.currentTarget.dataset.containerId;
      if (!id) return;

      await this.actor.toggleContainerExpanded(id);
    });

    /* QUANTITY */
    html.find(".inventory-list .item-qty").change(async ev => {
      const li = ev.currentTarget.closest(".item");
      const id = li?.dataset?.itemId;
      if (!id) return;

      const value = Math.max(0, Number(ev.currentTarget.value));

      const success = await this.actor.updateInventoryItemQuantity(id, value);
      if (!success) return;

      const item = this.actor.getInventoryItem(id);
      if (item?.system?.isContainer) {
        ev.currentTarget.value = 1;
      }
    });

    /* DELETE */
    html.find(".item-delete").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();

      const id = ev.currentTarget.dataset.itemId;
      if (!id) return;

      await this.actor.deleteInventoryItem(id);
    });

    /* EXTRACT */
    html.find(".item-extract").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();

      const id = ev.currentTarget.dataset.itemId;
      if (!id) return;

      await this.actor.extractItemFromContainer(id);
    });

    /* TRANSFER */
    html.find('[data-action="transfer-item"]').click(async ev => {
      await this._onTransferInventoryItem(ev);
    });

    /* SORT */
    html.find(".sortable").click(ev => {
      const field = ev.currentTarget.dataset.sort;
      if (!field) return;

      this._toggleSort(field);
      this.render();
    });

    /* DRAG START */
    html.find(".drag-handle").on("dragstart", ev => {
      const dt = this._getDragTransfer(ev);
      if (!dt) return;

      const itemId = ev.currentTarget.dataset.itemId;
      if (!itemId) return;

      dt.setData("text/plain", itemId);

      const li = ev.currentTarget.closest(".item");
      li?.classList.add("dragging");
    });

    html.find(".drag-handle").on("dragend", ev => {
      const li = ev.currentTarget.closest(".item");
      li?.classList.remove("dragging");

      html.find(".inventory-list .item.dragover").removeClass("dragover");
    });

    /* DRAG OVER */
    html.find(inventoryItemSelector).on("dragover", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.currentTarget.classList.add("dragover");
    });

    html.find(inventoryItemSelector).on("dragleave", ev => {
      ev.stopPropagation();
      ev.currentTarget.classList.remove("dragover");
    });

    html.find(inventoryItemSelector).on("drop", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.currentTarget.classList.remove("dragover");
      await this._handleInventoryDrop(ev);
    });
  }
}