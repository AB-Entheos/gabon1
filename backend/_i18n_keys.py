"""Re-apply the upload + new case-key i18n strings on en/fr."""
import json

FILES = {
    "en": r"C:\Users\markj\Documents\Emergency_Sys_Gabon\frontend\src\i18n\en.json",
    "fr": r"C:\Users\markj\Documents\Emergency_Sys_Gabon\frontend\src\i18n\fr.json",
}

UPLOAD = {
    "en": {
        "cta": "Click or drop files to upload",
        "queued": "Queued (offline). Will sync when online.",
        "queued_n": "Ready to upload ({n} file)",
        "description_label": "Description / alt text",
        "description_placeholder": "What does this document show?",
        "uploader_label": "Uploaded by",
        "uploader_placeholder": "e.g. CB Jean Mboumba",
        "ready_to_submit": "Ready to upload. Click Submit to add the files to the case.",
        "submit_button": "Submit",
        "many": "Select 1 or more files",
    },
    "fr": {
        "cta": "Cliquez ou déposez des fichiers",
        "queued": "Mis en file d'attente (hors ligne). Synchronisation automatique.",
        "queued_n": "Prêt à téléverser ({n} fichier)",
        "description_label": "Description / texte alternatif",
        "description_placeholder": "Que montre ce document ?",
        "uploader_label": "Téléversé par",
        "uploader_placeholder": "ex. CB Jean Mboumba",
        "ready_to_submit": "Prêt à téléverser. Cliquez sur Envoyer pour ajouter les fichiers au dossier.",
        "submit_button": "Envoyer",
        "many": "Sélectionnez un ou plusieurs fichiers",
    },
}

CASE = {
    "en": {
        "submit_button": "Submit case",
        "submitted_hint": "Case submitted. Click Verify to advance to the approval chain.",
    },
    "fr": {
        "submit_button": "Soumettre le dossier",
        "submitted_hint": "Dossier soumis. Cliquez sur Vérifier pour passer à la chaîne d'approbation.",
    },
}

for lang, path in FILES.items():
    with open(path, "r", encoding="utf-8") as fp:
        data = json.load(fp)
    data.setdefault("upload", {})
    for k, v in UPLOAD[lang].items():
        data["upload"].setdefault(k, v)
    data.setdefault("case", {})
    for k, v in CASE[lang].items():
        data["case"].setdefault(k, v)
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)
        fp.write("\n")
    print(f"updated {path}")