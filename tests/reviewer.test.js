const { RULES, generateFingerprint } = require('../src/reviewer');
const crypto = require('crypto');

describe('PR Sentry Rules', () => {
    
    describe('Null-handling Rules', () => {
        const rules = RULES.nullHandling;
        
        test('Should detect FirstOrDefault(). without null check', () => {
            const rule = rules[0];
            expect(rule.pattern.test('var user = db.Users.FirstOrDefault(u => u.Id == id).Name;')).toBe(true);
            rule.pattern.lastIndex = 0;
            expect(rule.pattern.test('var user = db.Users.FirstOrDefault();')).toBe(false);
            rule.pattern.lastIndex = 0;
        });

        test('Should detect suspicious null-forgiving operator', () => {
            const rule = rules[1];
            expect(rule.pattern.test('var name = user!.Name;')).toBe(true);
            rule.pattern.lastIndex = 0;
            expect(rule.pattern.test('var name = user.Name;')).toBe(false);
            rule.pattern.lastIndex = 0;
        });
    });

    describe('Async Rules', () => {
        const rules = RULES.async;

        test('Should detect async void outside event handlers', () => {
            const rule = rules[0];
            expect(rule.pattern.test('public async void DoSomething() { }')).toBe(true);
            rule.pattern.lastIndex = 0;
            expect(rule.pattern.test('private async void Button_Click(object sender, EventArgs e)')).toBe(false);
            rule.pattern.lastIndex = 0;
        });

        test('Should detect blocking async patterns', () => {
            const rule = rules[1];
            expect(rule.pattern.test('var result = task.Result;')).toBe(true);
            rule.pattern.lastIndex = 0;
            expect(rule.pattern.test('task.Wait();')).toBe(true);
            rule.pattern.lastIndex = 0;
            expect(rule.pattern.test('var result = task.GetAwaiter().GetResult();')).toBe(true);
            rule.pattern.lastIndex = 0;
            expect(rule.pattern.test('var result = await task;')).toBe(false);
            rule.pattern.lastIndex = 0;
        });
    });

    describe('SOLID Rules', () => {
        const rules = RULES.solid;

        test('Should detect excessive constructor dependencies', () => {
            const rule = rules[0];
            expect(rule.pattern.test('public MyService(IOne a, ITwo b, IThree c, IFour d, IFive e, ISix f)')).toBe(true);
            rule.pattern.lastIndex = 0;
            expect(rule.pattern.test('public MyService(IOne a, ITwo b)')).toBe(false);
            rule.pattern.lastIndex = 0;
        });

        test('Should detect direct infrastructure instantiation', () => {
            const rule = rules[1];
            expect(rule.pattern.test('var repo = new UserRepository();')).toBe(true);
            rule.pattern.lastIndex = 0;
            expect(rule.pattern.test('var user = new User();')).toBe(false);
            rule.pattern.lastIndex = 0;
        });
    });
});

describe('Fingerprint Generation', () => {
    test('Should generate stable fingerprint', () => {
        const fp1 = generateFingerprint('src/App.cs', 42, 'solid', 'Test Message');
        const fp2 = generateFingerprint('src/App.cs', 42, 'solid', 'Test Message');
        expect(fp1).toEqual(fp2);
        expect(fp1).toMatch(/<!-- pr-sentry:solid:src\/App\.cs:42:[a-f0-9]{64} -->/);
    });

    test('Should change fingerprint if line number changes', () => {
        const fp1 = generateFingerprint('src/App.cs', 42, 'solid', 'Test Message');
        const fp2 = generateFingerprint('src/App.cs', 43, 'solid', 'Test Message');
        expect(fp1).not.toEqual(fp2);
    });
});
