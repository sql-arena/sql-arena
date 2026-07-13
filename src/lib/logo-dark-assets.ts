const logoDarkAssetMap: Record<string, string> = {
	"CedarDB": "/img/logo-dark/CedarDB.webp",
	"ClickHouse": "/img/logo-dark/ClickHouse.webp",
	"Databricks": "/img/logo-dark/Databricks.webp",
	"DataFusion": "/img/logo-dark/DataFusion.webp",
	"DuckDB": "/img/logo-dark/DuckDB.webp",
	"MariaDB": "/img/logo-dark/MariaDB.webp",
	"Oracle": "/img/logo-dark/Oracle.webp",
	"ParquetLayout": "/img/logo-dark/ParquetLayout.png",
	"PostgreSQL": "/img/logo-dark/PostgreSQL.webp",
	"Redshift": "/img/logo-dark/Redshift.webp",
	"Snowflake": "/img/logo-dark/Snowflake.webp",
	"Spark": "/img/logo-dark/Spark.webp",
	"SQL Server": "/img/logo-dark/SQL Server.webp",
	"Starburst": "/img/logo-dark/Starburst.webp",
	"Teradata": "/img/logo-dark/Teradata.webp",
	"Trino": "/img/logo-dark/Trino.webp"
};

export function getLogoDarkAsset(engineName: string): string {
	return logoDarkAssetMap[engineName] ?? `/img/logo-dark/${engineName}.png`;
}
