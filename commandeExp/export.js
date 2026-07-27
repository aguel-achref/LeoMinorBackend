import ExcelJS from 'exceljs';
import { getAllCommandes } from './getAll.js'; // adapte le chemin vers ton fichier existant

// Libellés des colonnes affichées dans l'Excel, dans l'ordre souhaité.
// Chaque clé doit correspondre au nom du champ retourné par getAllCommandes.
const COLONNES = [
  { key: 'chaine', header: 'Chaîne', width: 10 },
  { key: 'commande', header: 'Commande', width: 18 },
  { key: 'client', header: 'Client', width: 18 },
  { key: 'models', header: 'Models', width: 16 },
  { key: 'qté_commandé', header: 'Qté commandé', width: 14 },
  { key: 'objectif', header: 'Objectif', width: 12 },
  { key: 'objectif_heure', header: 'Objectif heure', width: 14 },
  { key: 'date_debut_production', header: 'Début production', width: 16 },
  { key: 'date_fin_production', header: 'Fin production', width: 16 },
  { key: 'date_mise_disposition', header: 'Mise à disposition', width: 16 },
  { key: 'nombre_heure', header: "Nombre d'heures", width: 14 },
  { key: 'ecart', header: 'Écart (j)', width: 10 },
  { key: 'num_semaine', header: 'N° semaine', width: 14 },
  { key: 'statut', header: 'Statut', width: 16 },
];

// Champs contenant des dates SQL (formatées en JJ/MM/AAAA à l'export)
const CHAMPS_DATE = ['date_debut_production', 'date_fin_production', 'date_mise_disposition'];

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${jj}/${mm}/${d.getFullYear()}`;
}

/**
 * GET /api/commandes/export
 * Exporte toutes les commandes dans un fichier Excel (.xlsx) mis en forme.
 */
export async function exportCommandes (req, res){
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

    // Lignes de données
    commandes.forEach((commande) => {
      const row = {};
      COLONNES.forEach(({ key }) => {
        row[key] = CHAMPS_DATE.includes(key) ? formatDate(commande[key]) : commande[key] ?? '';
      });
      worksheet.addRow(row);
    });

    // Bordures + alignement + coloration légère selon le statut
    const statutFillMap = {
      Ouvert: 'FFD9F2D9',
      'En attente': 'FFFFF3CD',
      'Jour disposition': 'FFD6EAF8',
      Alerte: 'FFFADBD8',
      Fermé: 'FFE0E0E0',
    };

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const statutCell = row.getCell('statut');
      const fillColor = statutFillMap[statutCell.value];

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
}