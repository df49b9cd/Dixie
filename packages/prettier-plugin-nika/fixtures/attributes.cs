using System;
using System.Collections.Generic;

[Flags]
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Struct)]
public sealed class SampleAttribute : Attribute
{
    public SampleAttribute(string name, int value = 0)
    {
        Name = name;
        Value = value;
    }

    public string Name { get; }

    public int Value { get; }
}

[Sample("demo", Value = 10)]
public sealed class Annotated
{
    public Annotated(string name, params int[] items)
    {
        Name = name?.Trim() ?? throw new ArgumentNullException(nameof(name));
        Items = items ?? Array.Empty<int>();
    }

    public string Name { get; }

    public IReadOnlyList<int> Items { get; }
}
