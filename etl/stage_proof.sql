COPY (
SELECT
    engine,
    '[engine_version]' AS engine_version,
    '[submitter]' AS submitter,
    '[path]' AS file_source,
    categories,
    tags,
    theorem,
    theorem_description,
    proof_name,
    proof_value,
    proof_unit
FROM
    read_csv_auto('[path]')
) TO staging.proof;