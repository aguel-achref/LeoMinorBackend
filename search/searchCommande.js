import { db } from "../app.js";

export async function searchCommande(req, res) {
    try {
        const { localisation, brand } = req.body;        
        const [result] = await db.promise().query("SELECT * FROM commandes WHERE localisation LIKE ? OR brand LIKE ?", [`%${localisation}%` , `%${brand}%`]);
        if (result.length === 0) {
            return res.status(404).json({ message: "Commande not found" });
        }

        return res.status(200).json({
            success: true,
            status: 200,
            message: "commandes returned successfully",
            data: result,
        });

    } catch (error) {
        console.error("Error returned commandes:", error);
        res.status(500).json({ message: "Error returned commandes" });
    }
}

