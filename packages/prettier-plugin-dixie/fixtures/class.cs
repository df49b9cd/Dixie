class Greeter
{
    private readonly string _name;

    public Greeter(string name)
    {
        _name = name;
    }

    public string SayHello()
    {
        return $"Hello, {_name}!";
    }
}
