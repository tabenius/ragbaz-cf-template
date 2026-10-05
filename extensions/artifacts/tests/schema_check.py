"""Validate portable fixtures with an independent Draft 2020-12 validator."""
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

root = Path(__file__).resolve().parents[1]
artifact = json.loads((root / 'schemas/artifact.schema.json').read_text())
submission = json.loads((root / 'schemas/submission.schema.json').read_text())
registry = Registry().with_resources([
    (artifact['$id'], Resource.from_contents(artifact)),
    (submission['$id'], Resource.from_contents(submission)),
])
for schema in [artifact, submission]:
    Draft202012Validator.check_schema(schema)
artifact_validator = Draft202012Validator(artifact, registry=registry, format_checker=FormatChecker())
submission_validator = Draft202012Validator(submission, registry=registry, format_checker=FormatChecker())
config = json.loads((root / 'examples/maria/config.json').read_text())
for collection, items in config['inline'].items():
    for item in items:
        artifact_validator.validate(item)
        submission_validator.validate({'schema': 'ragbaz.artifact-submission/v1', 'collection': collection, 'direction': 'outbound', 'artifact': item})
submission_validator.validate(json.loads((root / 'examples/incoming-quote.json').read_text()))
print('Both Draft 2020-12 schemas and all portable example descriptors/envelopes passed.')
