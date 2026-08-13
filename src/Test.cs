public class Test { public void Run() { var user = db.Users.FirstOrDefault(u => u.Id == 1).Name; } }
