const { getConfig } = require("./config");

function getVaultPath() {
    const config = getConfig();
    const configVault =
        config && typeof config.vault === "string" ? config.vault.trim() : "";
    const envVault =
        typeof process.env.OBSKIT_VAULT === "string"
            ? process.env.OBSKIT_VAULT.trim()
            : "";
    const vault = envVault || configVault;

    if (vault) {
        return vault;
    }

    throw new Error(
        "Vault is not configured.\n\n" +
        "Run:\n\n" +
        "    obs init\n\n" +
        "to configure your Obsidian vault."
    );
}

module.exports = {
    getVaultPath,
};
