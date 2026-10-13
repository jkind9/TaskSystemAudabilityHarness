"""McCabe-style cyclomatic complexity per function, stdlib only.

Reads {"files": {name: source}} as JSON on stdin and prints {name: [{name, line, cc}]}.
A function starts at 1 and gains 1 per if/elif, loop, conditional expression, except clause,
comprehension loop or condition, match case, and each extra operand of and/or. Nested
functions and classes are scored on their own. A file that does not parse maps to null.
"""
import ast
import json
import sys

BRANCHES = (ast.If, ast.For, ast.AsyncFor, ast.While, ast.IfExp, ast.ExceptHandler)
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)


def score(function):
    total = 1
    stack = list(ast.iter_child_nodes(function))
    while stack:
        node = stack.pop()
        if isinstance(node, SCOPES):
            continue
        if isinstance(node, BRANCHES):
            total += 1
        elif isinstance(node, ast.BoolOp):
            total += len(node.values) - 1
        elif isinstance(node, ast.comprehension):
            total += 1 + len(node.ifs)
        elif type(node).__name__ == "match_case":
            total += 1
        stack.extend(ast.iter_child_nodes(node))
    return total


def functions(source):
    tree = ast.parse(source)
    return [
        {"name": node.name, "line": node.lineno, "cc": score(node)}
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]


def main():
    # Read bytes as UTF-8: on Windows sys.stdin uses the local code page, which garbles non-ASCII source.
    files = json.loads(sys.stdin.buffer.read().decode("utf-8"))["files"]
    out = {}
    for name, source in files.items():
        try:
            out[name] = functions(source)
        except SyntaxError:
            out[name] = None
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
