import ExcelJS from 'exceljs';
import { getAllCommandes } from './getAll.js'; // adapte le chemin vers ton fichier existant

// Colonnes à exporter, dans l'ordre exact demandé.
// Les dates sont déjà formatées en JJ/MM/AAAA par getAllCommandes, donc aucun
// retraitement n'est nécessaire ici.
const COLONNES = [
  { key: 'chaine', header: 'Chaîne', width: 10 },
  { key: 'commande', header: 'Commande', width: 16 },
  { key: 'client', header: 'Client', width: 18 },
  { key: 'num_semaine', header: 'N° semaine', width: 14 },
  { key: 'models', header: 'Models', width: 16 },
  { key: 'date_debut_production', header: 'Début production', width: 16 },
  { key: 'date_fin_production', header: 'Fin production', width: 16 },
  { key: 'date_mise_disposition', header: 'Mise à disposition', width: 16 },
  { key: 'ecart', header: 'Écart (j)', width: 10 },
  { key: 'objectif', header: 'Objectif', width: 12 },
  { key: 'qté_commandé', header: 'Qté commandé', width: 14 },
  { key: 'objectif_heure', header: 'Objectif heure', width: 14 },
  { key: 'statut', header: 'Statut', width: 16 },
  { key: 'nombre_heure', header: "Nombre d'heures", width: 14 },
];

// Couleur de fond légère selon le statut, pour une lecture rapide
const statutFillMap = {
  Ouvert: 'FFD9F2D9',
  'En attente': 'FFFFF3CD',
  'Jour disposition': 'FFD6EAF8',
  Alerte: 'FFFADBD8',
  Fermé: 'FFE0E0E0',
  Ferme: 'FFE0E0E0', // variante sans accent observée dans les données
};

/**
 * GET /api/commandes/export
 * Exporte uniquement les colonnes métier des commandes dans un fichier Excel (.xlsx).
 */
export const exportCommandes = async (req, res) => {
  try {
    const commandes = await getAllCommandes();

    if (!commandes || commandes.length === 0) {
      return res.status(404).json({ message: 'Aucune commande à exporter' });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Leo Minor Tunisie';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Commandes');
    worksheet.columns = COLONNES.map((c) => ({ header: c.header, key: c.key, width: c.width }));

    // Style de l'en-tête
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    headerRow.height = 20;

    // Lignes de données : on ne garde que les colonnes demandées
    commandes.forEach((commande) => {
      const row = {};
      COLONNES.forEach(({ key }) => {
        row[key] = commande[key] ?? '';
      });
      worksheet.addRow(row);
    });

    // Bordures + alignement + coloration selon le statut
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const fillColor = statutFillMap[row.getCell('statut').value];

      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        if (fillColor) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
        }
      });
    });

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + COLONNES.length)}1` };

    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `commandes_export_${dateStr}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Erreur export Excel:', error);
    res.status(500).json({ message: "Erreur lors de l'export Excel", error: error.message });
  }
};