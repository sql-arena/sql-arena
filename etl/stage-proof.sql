INSERT INTO staging.proof (engine,
                           engine_version,
                           submitter,
                           file_source,
                           components,
                           tags,
                           theorem,
                           theorem_description,
                           proof,
                           proof_value,
                           proof_unit)
SELECT engine,
       '[engine_version]' AS engine_version,
       '[submitter]'      AS submitter,
       '[path]'           AS file_source,
       categories,
       tags,
       theorem,
       theorem_description,
       proof_name,
       proof_value,
       proof_unit
FROM
    read_csv_auto('[path]')

;