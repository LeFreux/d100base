export class D100ItemSheet extends ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["d100base", "sheet", "item"],
      width: 520,
      height: 560,
      dragDrop: [{ dropSelector: ".container-default-contents" }]
    });
  }

  get template() {
    return "systems/d100base/templates/item-sheet.hbs";
  }

  getData() {

    const context = super.getData();

    context.system = this.item.system;

    /* conteneur : poids du contenu */

    const contents = this.item.system.defaultContents ?? [];

    const contentWeight = contents.reduce((sum, c) => {
      return sum + (c.weight ?? 0);
    }, 0);

	const emptyWeight = this.item.system.emptyWeight ?? 0;

	context.contentWeight = contentWeight;
	context.totalWeight = this.item.system.weight ?? 0;
	context.emptyWeight = emptyWeight;

    /* catégories */

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

  /* calcul  du poids */

  async _recalculateWeight() {

    const system = this.item.system;

    /* objet normal */

    if (!system.isContainer) {

      const quantity = system.quantity ?? 0;
      const unitWeight = system.unitWeight ?? 0;

      const totalWeight = quantity * unitWeight;

      if (system.weight !== totalWeight) {

        await this.item.update({
          "system.weight": totalWeight
        });

      }

      return;
    }

	/* conteneur */

	const contents = system.defaultContents ?? [];

	const contentWeight = contents.reduce((sum, c) => {
	  return sum + (c.weight ?? 0);
	}, 0);

	const emptyWeight = system.emptyWeight ?? 0;

	const newUnitWeight = emptyWeight + contentWeight;

	const quantity = system.quantity ?? 1;

	const totalWeight = newUnitWeight * quantity;

	/* mise à jour poids unitaire et total */

	if (system.unitWeight !== newUnitWeight || system.weight !== totalWeight) {
	  await this.item.update({
		"system.unitWeight": newUnitWeight,
		"system.weight": totalWeight
	  });
	}

  }


  async _recalculateWeightFromForm(html) {
	const isContainer = this.item.system.isContainer;

	const quantity = Number(html.find('input[name="system.quantity"]').val()) || 0;

	if (!isContainer) {
	  const unitWeight = Number(html.find('input[name="system.unitWeight"]').val()) || 0;
	  const totalWeight = unitWeight * quantity;

	  await this.item.update({
	    "system.weight": totalWeight
	  });
	  return;
	}

	const emptyWeight = Number(html.find('input[name="system.emptyWeight"]').val()) || 0;
	const contents = this.item.system.defaultContents ?? [];

	const contentWeight = contents.reduce((sum, c) => sum + (c.weight ?? 0), 0);
	const newUnitWeight = emptyWeight + contentWeight;
	const totalWeight = newUnitWeight * quantity;

	await this.item.update({
	  "system.emptyWeight": emptyWeight,
	  "system.unitWeight": newUnitWeight,
	  "system.weight": totalWeight
	});
	
  }


  activateListeners(html) {

    super.activateListeners(html);

    /* recalcul poids objet */

	html.find('input[name="system.quantity"], input[name="system.unitWeight"], input[name="system.emptyWeight"]').change(async () => {
	  await this._recalculateWeightFromForm(html);
	});

    /* supprimer contenu */

    html.find(".remove-default-content").click(async ev => {

      const row = ev.currentTarget.closest(".default-content-row");
      const index = Number(row.dataset.index);

      const contents = [...this.item.system.defaultContents];

      contents.splice(index, 1);

      await this.item.update({
        "system.defaultContents": contents
      });

      await this._recalculateWeight();

    });

    /* Modification de la quantité  */

    html.find(".qty-minus, .qty-plus, .qty-minus5, .qty-plus5").click(async ev => {

      const row = ev.currentTarget.closest(".default-content-row");
      const index = Number(row.dataset.index);

      const contents = duplicate(this.item.system.defaultContents);
      const entry = contents[index];

      let delta = 0;

      if (ev.currentTarget.classList.contains("qty-minus")) delta = -1;
      if (ev.currentTarget.classList.contains("qty-plus")) delta = 1;
      if (ev.currentTarget.classList.contains("qty-minus5")) delta = -5;
      if (ev.currentTarget.classList.contains("qty-plus5")) delta = 5;

      entry.quantity = Math.max(0, entry.quantity + delta);

      entry.weight = entry.unitWeight * entry.quantity;

      await this.item.update({
        "system.defaultContents": contents
      });

      await this._recalculateWeight();

    });

    /* Ouvrir fiche item en lecture seule */

    html.find(".item-open").dblclick(async ev => {

      const index = Number(ev.currentTarget.dataset.index);
      const content = this.item.system.defaultContents[index];

      if (!content?.uuid) return;

      const item = await fromUuid(content.uuid);

      if (!item) return;

      const sheet = item.sheet;

      sheet.render(true);

      Hooks.once("render" + sheet.constructor.name, (app, html) => {

        if (app.object.id !== item.id) return;

        html.find("input, select, textarea, button").prop("disabled", true);

      });

    });
	
	/* Décochage du conteneur et destruction du contenu */
	
	html.find('input[name="system.isContainer"]').change(async ev => {

	  const checked = ev.currentTarget.checked;

	  /* activation conteneur */

	  if (checked) {

		await this.item.update({
		  "system.isContainer": true
		});

		await this._recalculateWeight();
		return;

	  }

	  /* désactivation conteneur */

	  const contents = this.item.system.defaultContents ?? [];

	  if (contents.length === 0) {

		await this.item.update({
		  "system.isContainer": false
		});

		await this._recalculateWeight();
		return;

	  }

	  const confirmed = await Dialog.confirm({
		title: "Retirer le statut de conteneur",
		content: "<p>Cet objet contient des éléments. Les supprimer ?</p>"
	  });

	  if (!confirmed) {

		/* on restaure la valeur */

		ev.preventDefault();

		this.render(true);

		return;

	  }

	  await this.item.update({
		"system.isContainer": false,
		"system.defaultContents": []
	  });

	  await this._recalculateWeight();

	});

	/* Gestion du drag */
	
	html.find(".default-content-row").on("dragstart", ev => {

	  const index = Number(ev.currentTarget.dataset.index);
	  const content = this.item.system.defaultContents[index];

	  if (!content?.sourceId) return;

	  ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify({
		type: "Item",
		uuid: content.sourceId,
		containerId: this.item.id,
		index: index
	  }));

	});

  }

  async _onDrop(event) {

	const data = TextEditor.getDragEventData(event);

	if (data.type !== "Item") return;

	/* vérifie que la destination est un conteneur */

	if (!this.item.system.isContainer) {

	  ui.notifications.warn(
		"Cet objet n'est pas un conteneur."
	  );

	  return;
	  
	}

	/* récupérer l'objet droppé */

	const droppedItem = await Item.fromDropData(data);

	if (!droppedItem) return;

	/* sécu : anti self drop */

	if (droppedItem.uuid === this.item.uuid || droppedItem.parent?.uuid === this.item.uuid) {

	  ui.notifications.warn(
		"Impossible de placer ce conteneur ici."
	  );

	  return;

	}

	/* copie du contenu */

	const contents = foundry.utils.deepClone(
	  this.item.system.defaultContents ?? []
	);

	const qty = droppedItem.system.quantity ?? 1;
	const weight = droppedItem.system.weight ?? 0;
	const unitWeight = qty > 0 ? weight / qty : 0;

	/* poids actuel du contenu */

	const currentWeight = contents.reduce((sum, c) => {
	  return sum + (c.weight ?? 0);
	}, 0);

	/* capacité maximale */

	const capacity = this.item.system.capacityWeight ?? 0;

	/* correction du test de capacité */

	const futureWeight = currentWeight + weight;

	if (capacity > 0 && futureWeight > capacity) {

	  ui.notifications.warn(
		"Ce conteneur ne peut pas contenir cet objet (capacité dépassée)."
	  );

	  return;

	}

	/* fusion des objets identiques */

	const existing = contents.find(c =>
	  c.sourceId === droppedItem.uuid
	);

	if (existing) {

	  existing.quantity += qty;
	  existing.weight = existing.unitWeight * existing.quantity;

	} else {

	  contents.push({
		name: droppedItem.name,
		quantity: qty,
		weight: weight,
		unitWeight: unitWeight,
		category: droppedItem.system.category ?? "",
		img: droppedItem.img ?? "icons/svg/item-bag.svg",
		uuid: droppedItem.uuid,
		sourceId: droppedItem.uuid
	  });

	}

	/* mise à jour conteneur destination */

	await this.item.update({
	  "system.defaultContents": contents
	});

	await this._recalculateWeight();

	/* supprimer du conteneur source si drag interne */

	if (data.uuid) {

	  const sourceContainers = game.items.filter(i =>
		i.system?.defaultContents?.some(c => c.sourceId === data.uuid)
	  );

	  for (const container of sourceContainers) {

		if (container.id === this.item.id) continue;

		const sourceContents = foundry.utils.deepClone(
		  container.system.defaultContents ?? []
		);

		const index = sourceContents.findIndex(c =>
		  c.sourceId === data.uuid
		);

		if (index !== -1) {

		  const entry = sourceContents[index];

		  if (entry.quantity > 1) {

			entry.quantity -= 1;
			entry.weight = entry.unitWeight * entry.quantity;

		  } else {

			sourceContents.splice(index, 1);

		  }

		  await container.update({
			"system.defaultContents": sourceContents
		  });

		  if (container.sheet?.rendered) {
			await container.sheet._recalculateWeight();
		  }

		}

	  }

	}

  }


}